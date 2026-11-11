import dayjs from 'dayjs';
import { and, asc, eq, gte, inArray, lt, ne, sql, getTableColumns } from 'drizzle-orm';
import orm from '../entity/orm';
import userForward from '../entity/user-forward';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import { settingConst, emailConst, userConst } from '../const/entity-const';
import emailUtils from '../utils/email-utils';
import settingService from './setting-service';
import accountService from './account-service';
import userService from './user-service';
import permService from './perm-service';
import roleService from './role-service';
import emailService from './email-service';
import forwardVerifyTemplate from '../template/forward-verify';
import {
	FORWARD_STATUS,
	FORWARD_LIMITS,
	normalizeEmail,
	validateTarget,
	genVerifyCode,
	matchVerifyCode,
	isCodeExhausted,
	pickChannel,
	canUseForward,
	isForwardedMail,
	buildForwardParams,
	formatLastError,
	withTimeout
} from '../lib/forward-rules';

const { verifyCode: _omit, ...listColumns } = getTableColumns(userForward);

const forwardService = {

	async getOwnUser(c, userId) {
		const userRow = await userService.selectById(c, userId);
		if (!userRow) {
			throw new BizError(t('authExpired'), 401);
		}
		return userRow;
	},

	async getOwnForward(c, forwardId, userId) {
		const row = await orm(c).select().from(userForward)
			.where(eq(userForward.forwardId, Number(forwardId))).get();
		if (!row || row.userId !== userId) {
			throw new BizError(t('forwardNotExist'));
		}
		return { row };
	},

	async list(c, userId) {
		return orm(c).select(listColumns).from(userForward)
			.where(eq(userForward.userId, userId))
			.orderBy(asc(userForward.forwardId)).all();
	},

	async assertCanForward(c, userId) {
		const setting = await settingService.query(c);

		if (setting.userForward !== settingConst.userForward.OPEN) {
			throw new BizError(t('forwardDisabled'));
		}

		const userRow = await userService.selectById(c, userId);
		const isAdmin = userRow.email === c.env.admin;

		if (!isAdmin) {
			const permKeys = await permService.userPermKeys(c, userId);
			const roleRow = await roleService.selectByUserId(c, userId);
			if (!canUseForward({ isAdmin, permKeys, sendType: roleRow?.sendType })) {
				throw new BizError(t('forwardNoPerm'));
			}
		}

		return setting;
	},

	async add(c, { targetEmail }, userId, lang) {
		const userRow = await this.getOwnUser(c, userId);
		const setting = await this.assertCanForward(c, userId);

		const existing = await orm(c).select({ targetEmail: userForward.targetEmail }).from(userForward)
			.where(eq(userForward.userId, userId)).all();

		const invalid = validateTarget({
			target: targetEmail,
			accountEmail: userRow.email,
			domainList: setting.domainList,
			existingTargets: existing.map(item => item.targetEmail)
		});
		if (invalid) {
			throw new BizError(t(invalid));
		}

		const target = normalizeEmail(targetEmail);

		const channel = pickChannel({
			hasCfEmail: !!c.env.email,
			resendTokens: setting.resendTokens,
			accountEmail: userRow.email
		});
		if (!channel) {
			throw new BizError(t('forwardNoProvider'));
		}

		await this.reserveVerifySend(c, target, userId);

		const code = genVerifyCode();
		const now = Date.now();
		const forwardId = await this.insertWithinLimit(c, {
			userId,
			targetEmail: target,
			verifyCode: code,
			verifyExpireTime: new Date(now + FORWARD_LIMITS.codeTtlMs).toISOString(),
			verifySendTime: new Date(now).toISOString()
		});

		try {
			await this.sendVerifyMail(c, channel, userRow, target, code, lang);
		} catch (e) {
			await orm(c).delete(userForward).where(eq(userForward.forwardId, forwardId)).run();
			throw e;
		}

		return orm(c).select(listColumns).from(userForward)
			.where(eq(userForward.forwardId, forwardId)).get();
	},

	// 条件插入：数量上限在 SQL 里判断，并发添加也不会超过 3 条；重复地址由唯一索引拦截
	async insertWithinLimit(c, { userId, targetEmail, verifyCode, verifyExpireTime, verifySendTime }) {
		let inserted;
		try {
			inserted = await c.env.db.prepare(`
				INSERT INTO user_forward (user_id, target_email, status, verify_code, verify_expire_time, verify_send_time)
				SELECT ?, ?, ?, ?, ?, ?
				WHERE (SELECT COUNT(*) FROM user_forward WHERE user_id = ?) < ?
				RETURNING forward_id AS forwardId
			`).bind(
				userId, targetEmail, FORWARD_STATUS.PENDING, verifyCode, verifyExpireTime, verifySendTime,
				userId, FORWARD_LIMITS.maxTargets
			).first();
		} catch (e) {
			if (String(e?.message).includes('UNIQUE constraint failed')) {
				throw new BizError(t('forwardTargetExists'));
			}
			throw e;
		}
		if (!inserted) {
			throw new BizError(t('forwardTargetLimit'));
		}
		return inserted.forwardId;
	},

	// 检查并占用验证邮件额度：冷却和每日次数各用一条条件 upsert，判断和计数在同一条 SQL 里完成，
	// 并发请求只有满足条件的那一个能拿到返回行。发送前占用，发送失败不退还。
	async reserveVerifySend(c, target, userId) {
		const now = Date.now();

		const cooldown = await c.env.db.prepare(`
			INSERT INTO forward_verify_quota (quota_key, count, last_time) VALUES (?, 1, ?)
			ON CONFLICT(quota_key) DO UPDATE SET count = count + 1, last_time = excluded.last_time
			WHERE forward_verify_quota.last_time <= ?
			RETURNING quota_key
		`).bind('target:' + target, now, now - FORWARD_LIMITS.targetCooldownSec * 1000).first();
		if (!cooldown) {
			throw new BizError(t('forwardVerifyTooFrequent'));
		}

		const day = await c.env.db.prepare(`
			INSERT INTO forward_verify_quota (quota_key, count, last_time) VALUES (?, 1, ?)
			ON CONFLICT(quota_key) DO UPDATE SET count = count + 1, last_time = excluded.last_time
			WHERE forward_verify_quota.count < ?
			RETURNING count
		`).bind('day:' + userId + ':' + dayjs().format('YYYY-MM-DD'), now, FORWARD_LIMITS.dailyVerifyLimit).first();
		if (!day) {
			throw new BizError(t('forwardVerifyDayLimit'));
		}
	},

	// 定时任务调用：清理两天前的冷却和每日计数记录
	async clearVerifyQuota(c) {
		await c.env.db.prepare(`DELETE FROM forward_verify_quota WHERE last_time < ?`)
			.bind(Date.now() - 2 * 86400 * 1000).run();
	},

	// 验证邮件从用户主邮箱发出，显示名取主邮箱账号的名称
	async sendVerifyMail(c, channel, userRow, target, code, lang) {
		const mainAccount = await accountService.selectByEmailIncludeDel(c, userRow.email);
		const { subject, text, html } = forwardVerifyTemplate({ accountEmail: userRow.email, code, lang });
		await this.deliver(c, channel, {
			accountEmail: userRow.email,
			name: mainAccount?.name || emailUtils.getName(userRow.email),
			receiveEmail: [target],
			subject,
			text,
			html
		});
	},

	async resendCode(c, { forwardId }, userId, lang) {
		const { row } = await this.getOwnForward(c, forwardId, userId);
		if (row.status !== FORWARD_STATUS.PENDING) return;

		const userRow = await this.getOwnUser(c, userId);
		const setting = await this.assertCanForward(c, userId);
		const channel = pickChannel({
			hasCfEmail: !!c.env.email,
			resendTokens: setting.resendTokens,
			accountEmail: userRow.email
		});
		if (!channel) {
			throw new BizError(t('forwardNoProvider'));
		}

		await this.reserveVerifySend(c, row.targetEmail, userId);

		const code = genVerifyCode();
		const now = Date.now();
		await orm(c).update(userForward).set({
			verifyCode: code,
			verifyExpireTime: new Date(now + FORWARD_LIMITS.codeTtlMs).toISOString(),
			verifySendTime: new Date(now).toISOString(),
			verifyFailCount: 0
		}).where(eq(userForward.forwardId, row.forwardId)).run();

		await this.sendVerifyMail(c, channel, userRow, row.targetEmail, code, lang);
	},

	async verify(c, { forwardId, code }, userId) {
		const { row } = await this.getOwnForward(c, forwardId, userId);
		if (row.status !== FORWARD_STATUS.PENDING) return;

		// 先原子地消耗一次尝试机会再比较；码已作废、已过期或次数用尽时拿不到行
		const attempt = await orm(c).update(userForward)
			.set({ verifyFailCount: sql`${userForward.verifyFailCount} + 1` })
			.where(and(
				eq(userForward.forwardId, row.forwardId),
				eq(userForward.status, FORWARD_STATUS.PENDING),
				ne(userForward.verifyCode, ''),
				lt(userForward.verifyFailCount, FORWARD_LIMITS.maxCodeFails),
				gte(userForward.verifyExpireTime, new Date().toISOString())
			))
			.returning({ verifyCode: userForward.verifyCode, verifyFailCount: userForward.verifyFailCount })
			.get();

		if (!attempt) {
			throw new BizError(t('forwardCodeInvalid'));
		}

		if (matchVerifyCode(attempt.verifyCode, code)) {
			const activated = await orm(c).update(userForward).set({
				status: FORWARD_STATUS.ACTIVE,
				verifyCode: '',
				verifyFailCount: 0
			}).where(and(
				eq(userForward.forwardId, row.forwardId),
				eq(userForward.status, FORWARD_STATUS.PENDING),
				eq(userForward.verifyCode, attempt.verifyCode)
			)).returning({ forwardId: userForward.forwardId }).get();
			if (!activated) {
				throw new BizError(t('forwardCodeInvalid'));
			}
			return;
		}

		if (isCodeExhausted(attempt.verifyFailCount)) {
			await orm(c).update(userForward).set({ verifyCode: '' })
				.where(and(
					eq(userForward.forwardId, row.forwardId),
					eq(userForward.status, FORWARD_STATUS.PENDING),
					eq(userForward.verifyCode, attempt.verifyCode),
					gte(userForward.verifyFailCount, FORWARD_LIMITS.maxCodeFails)
				)).run();
		}

		throw new BizError(t('forwardCodeWrong'));
	},

	async setStatus(c, { forwardId, status }, userId) {
		const { row } = await this.getOwnForward(c, forwardId, userId);

		if (row.status === FORWARD_STATUS.PENDING) {
			throw new BizError(t('forwardNotVerified'));
		}

		status = Number(status);
		if (status !== FORWARD_STATUS.ACTIVE && status !== FORWARD_STATUS.DISABLED) {
			return;
		}

		const set = { status };
		if (status === FORWARD_STATUS.ACTIVE) {
			set.failCount = 0;
			set.lastError = '';
		}
		await orm(c).update(userForward).set(set)
			.where(and(
				eq(userForward.forwardId, row.forwardId),
				inArray(userForward.status, [FORWARD_STATUS.ACTIVE, FORWARD_STATUS.DISABLED, FORWARD_STATUS.FAILED])
			)).run();
	},

	async remove(c, { forwardId }, userId) {
		const { row } = await this.getOwnForward(c, forwardId, userId);
		await orm(c).delete(userForward).where(eq(userForward.forwardId, row.forwardId)).run();
	},

	// 收件时自动转发，永不抛错
	async forwardReceived(c, emailRow, message) {
		try {
			if (!emailRow || !emailRow.accountId || emailRow.status !== emailConst.status.RECEIVE) return;
			if (isForwardedMail(message.rawHeaders)) return;

			const setting = await settingService.query(c);
			if (setting.userForward !== settingConst.userForward.OPEN) return;

			// 目标属于用户：用户名下任一邮箱收到的信都转发
			const rows = await orm(c).select().from(userForward)
				.where(and(
					eq(userForward.userId, emailRow.userId),
					eq(userForward.status, FORWARD_STATUS.ACTIVE)
				)).all();
			if (rows.length === 0) return;

			const accountRow = await accountService.selectById(c, emailRow.accountId);
			if (!accountRow) return;
			const userRow = await userService.selectByIdIncludeDel(c, accountRow.userId);
			if (!userRow || userRow.isDel || userRow.status === userConst.status.BAN) return;

			const isAdmin = userRow.email === c.env.admin;
			if (!isAdmin) {
				const permKeys = await permService.userPermKeys(c, userRow.userId);
				const roleRow = await roleService.selectByUserId(c, userRow.userId);
				if (!canUseForward({ isAdmin, permKeys, sendType: roleRow?.sendType })) return;
			}

			const channel = pickChannel({
				hasCfEmail: !!c.env.email,
				resendTokens: setting.resendTokens,
				accountEmail: accountRow.email
			});
			if (!channel) {
				console.warn('转发跳过：' + accountRow.email + ' 所在域名没有发信渠道');
				return;
			}

			const attachments = (message.attachments || []).map(a => ({
				filename: a.filename,
				mimeType: a.mimeType || a.contentType || a.type,
				contentId: (a.contentId || '').replace(/^<|>$/g, '') || undefined,
				content: a.content
			}));

			await Promise.all(rows.map(async row => {
				try {
					const params = buildForwardParams({
						accountEmail: accountRow.email,
						target: row.targetEmail,
						subject: message.subject,
						html: message.html,
						text: message.text,
						fromAddress: message.fromAddress,
						fromName: message.fromName,
						attachments
					});
					await withTimeout(this.deliver(c, channel, params), FORWARD_LIMITS.sendTimeoutMs);
					if (row.failCount > 0) {
						await orm(c).update(userForward).set({ failCount: 0, lastError: '' })
							.where(eq(userForward.forwardId, row.forwardId)).run();
					}
				} catch (e) {
					console.error('转发邮箱 ' + row.targetEmail + ' 失败：', e);
					try {
						await this.recordSendFailure(c, row.forwardId, e?.message);
					} catch (err) {
						console.error(err);
					}
				}
			}));
		} catch (e) {
			console.error('用户转发异常：', e);
		}
	},

	// 计数在 SQL 里自增；只更新仍处于启用状态的记录，不会把用户刚停用的目标改回来
	async recordSendFailure(c, forwardId, message) {
		await orm(c).update(userForward).set({
			failCount: sql`${userForward.failCount} + 1`,
			lastError: formatLastError(message),
			status: sql`CASE WHEN ${userForward.failCount} + 1 >= ${FORWARD_LIMITS.maxSendFails} THEN ${FORWARD_STATUS.FAILED} ELSE ${userForward.status} END`
		}).where(and(
			eq(userForward.forwardId, forwardId),
			eq(userForward.status, FORWARD_STATUS.ACTIVE)
		)).run();
	},

	async deliver(c, channel, params) {
		if (channel.type === 'cloudflare') {
			await emailService.sendByCloudflareEmail(c, params);
			return;
		}
		const { error } = await emailService.sendByResend(channel.token, params);
		if (error) {
			throw new Error(error.message);
		}
	}
};

export default forwardService;

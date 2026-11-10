import dayjs from 'dayjs';
import { and, asc, eq, gte, inArray, lt, ne, sql, getTableColumns } from 'drizzle-orm';
import orm from '../entity/orm';
import accountForward from '../entity/account-forward';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import KvConst from '../const/kv-const';
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

const { verifyCode: _omit, ...listColumns } = getTableColumns(accountForward);

const forwardService = {

	async getOwnAccount(c, accountId, userId) {
		const accountRow = await accountService.selectById(c, accountId);
		if (!accountRow || accountRow.userId !== userId) {
			throw new BizError(t('noUserAccount'));
		}
		return accountRow;
	},

	async getOwnForward(c, forwardId, userId) {
		const row = await orm(c).select().from(accountForward)
			.where(eq(accountForward.forwardId, Number(forwardId))).get();
		if (!row || row.userId !== userId) {
			throw new BizError(t('forwardNotExist'));
		}
		const accountRow = await accountService.selectById(c, row.accountId);
		if (!accountRow || accountRow.userId !== userId) {
			throw new BizError(t('noUserAccount'));
		}
		return { row, accountRow };
	},

	async list(c, { accountId }, userId) {
		await this.getOwnAccount(c, Number(accountId), userId);
		return orm(c).select(listColumns).from(accountForward)
			.where(eq(accountForward.accountId, Number(accountId)))
			.orderBy(asc(accountForward.forwardId)).all();
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

	async add(c, { accountId, targetEmail }, userId, lang) {
		const accountRow = await this.getOwnAccount(c, Number(accountId), userId);
		const setting = await this.assertCanForward(c, userId);

		const existing = await orm(c).select({ targetEmail: accountForward.targetEmail }).from(accountForward)
			.where(eq(accountForward.accountId, accountRow.accountId)).all();

		const invalid = validateTarget({
			target: targetEmail,
			accountEmail: accountRow.email,
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
			accountEmail: accountRow.email
		});
		if (!channel) {
			throw new BizError(t('forwardNoProvider'));
		}

		await this.reserveVerifySend(c, target, userId);

		const code = genVerifyCode();
		const now = Date.now();
		const forwardId = await this.insertWithinLimit(c, {
			accountId: accountRow.accountId,
			userId,
			targetEmail: target,
			verifyCode: code,
			verifyExpireTime: new Date(now + FORWARD_LIMITS.codeTtlMs).toISOString(),
			verifySendTime: new Date(now).toISOString()
		});

		try {
			await this.sendVerifyMail(c, channel, accountRow, target, code, lang);
		} catch (e) {
			await orm(c).delete(accountForward).where(eq(accountForward.forwardId, forwardId)).run();
			throw e;
		}

		return orm(c).select(listColumns).from(accountForward)
			.where(eq(accountForward.forwardId, forwardId)).get();
	},

	// 条件插入：数量上限在 SQL 里判断，并发添加也不会超过 3 条；重复地址由唯一索引拦截
	async insertWithinLimit(c, { accountId, userId, targetEmail, verifyCode, verifyExpireTime, verifySendTime }) {
		let inserted;
		try {
			inserted = await c.env.db.prepare(`
				INSERT INTO account_forward (account_id, user_id, target_email, status, verify_code, verify_expire_time, verify_send_time)
				SELECT ?, ?, ?, ?, ?, ?, ?
				WHERE (SELECT COUNT(*) FROM account_forward WHERE account_id = ?) < ?
				RETURNING forward_id AS forwardId
			`).bind(
				accountId, userId, targetEmail, FORWARD_STATUS.PENDING, verifyCode, verifyExpireTime, verifySendTime,
				accountId, FORWARD_LIMITS.maxTargets
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

	// 检查并立即占用验证邮件额度（发送前写入，失败不退还），把并发窗口缩到毫秒级
	async reserveVerifySend(c, target, userId) {
		const targetKey = KvConst.FORWARD_VERIFY_TARGET + target;
		if (await c.env.kv.get(targetKey)) {
			throw new BizError(t('forwardVerifyTooFrequent'));
		}
		const dayKey = this.dayKey(userId);
		const dayCount = Number(await c.env.kv.get(dayKey) || 0);
		if (dayCount >= FORWARD_LIMITS.dailyVerifyLimit) {
			throw new BizError(t('forwardVerifyDayLimit'));
		}
		await Promise.all([
			c.env.kv.put(targetKey, '1', { expirationTtl: FORWARD_LIMITS.targetCooldownSec }),
			c.env.kv.put(dayKey, String(dayCount + 1), { expirationTtl: 86400 })
		]);
	},

	dayKey(userId) {
		return KvConst.FORWARD_VERIFY_DAY + userId + ':' + dayjs().format('YYYY-MM-DD');
	},

	async sendVerifyMail(c, channel, accountRow, target, code, lang) {
		const { subject, text, html } = forwardVerifyTemplate({ accountEmail: accountRow.email, code, lang });
		await this.deliver(c, channel, {
			accountEmail: accountRow.email,
			name: accountRow.name || emailUtils.getName(accountRow.email),
			receiveEmail: [target],
			subject,
			text,
			html
		});
	},

	async resendCode(c, { forwardId }, userId, lang) {
		const { row, accountRow } = await this.getOwnForward(c, forwardId, userId);
		if (row.status !== FORWARD_STATUS.PENDING) return;

		const setting = await this.assertCanForward(c, userId);
		const channel = pickChannel({
			hasCfEmail: !!c.env.email,
			resendTokens: setting.resendTokens,
			accountEmail: accountRow.email
		});
		if (!channel) {
			throw new BizError(t('forwardNoProvider'));
		}

		await this.reserveVerifySend(c, row.targetEmail, userId);

		const code = genVerifyCode();
		const now = Date.now();
		await orm(c).update(accountForward).set({
			verifyCode: code,
			verifyExpireTime: new Date(now + FORWARD_LIMITS.codeTtlMs).toISOString(),
			verifySendTime: new Date(now).toISOString(),
			verifyFailCount: 0
		}).where(eq(accountForward.forwardId, row.forwardId)).run();

		await this.sendVerifyMail(c, channel, accountRow, row.targetEmail, code, lang);
	},

	async verify(c, { forwardId, code }, userId) {
		const { row } = await this.getOwnForward(c, forwardId, userId);
		if (row.status !== FORWARD_STATUS.PENDING) return;

		// 先原子地消耗一次尝试机会再比较；码已作废、已过期或次数用尽时拿不到行
		const attempt = await orm(c).update(accountForward)
			.set({ verifyFailCount: sql`${accountForward.verifyFailCount} + 1` })
			.where(and(
				eq(accountForward.forwardId, row.forwardId),
				eq(accountForward.status, FORWARD_STATUS.PENDING),
				ne(accountForward.verifyCode, ''),
				lt(accountForward.verifyFailCount, FORWARD_LIMITS.maxCodeFails),
				gte(accountForward.verifyExpireTime, new Date().toISOString())
			))
			.returning({ verifyCode: accountForward.verifyCode, verifyFailCount: accountForward.verifyFailCount })
			.get();

		if (!attempt) {
			throw new BizError(t('forwardCodeInvalid'));
		}

		if (matchVerifyCode(attempt.verifyCode, code)) {
			const activated = await orm(c).update(accountForward).set({
				status: FORWARD_STATUS.ACTIVE,
				verifyCode: '',
				verifyFailCount: 0
			}).where(and(
				eq(accountForward.forwardId, row.forwardId),
				eq(accountForward.status, FORWARD_STATUS.PENDING),
				eq(accountForward.verifyCode, attempt.verifyCode)
			)).returning({ forwardId: accountForward.forwardId }).get();
			if (!activated) {
				throw new BizError(t('forwardCodeInvalid'));
			}
			return;
		}

		if (isCodeExhausted(attempt.verifyFailCount)) {
			await orm(c).update(accountForward).set({ verifyCode: '' })
				.where(and(
					eq(accountForward.forwardId, row.forwardId),
					eq(accountForward.status, FORWARD_STATUS.PENDING),
					eq(accountForward.verifyCode, attempt.verifyCode),
					gte(accountForward.verifyFailCount, FORWARD_LIMITS.maxCodeFails)
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
		await orm(c).update(accountForward).set(set)
			.where(and(
				eq(accountForward.forwardId, row.forwardId),
				inArray(accountForward.status, [FORWARD_STATUS.ACTIVE, FORWARD_STATUS.DISABLED, FORWARD_STATUS.FAILED])
			)).run();
	},

	async remove(c, { forwardId }, userId) {
		const { row } = await this.getOwnForward(c, forwardId, userId);
		await orm(c).delete(accountForward).where(eq(accountForward.forwardId, row.forwardId)).run();
	},

	// 收件时自动转发，永不抛错
	async forwardReceived(c, emailRow, message) {
		try {
			if (!emailRow || !emailRow.accountId || emailRow.status !== emailConst.status.RECEIVE) return;
			if (isForwardedMail(message.rawHeaders)) return;

			const setting = await settingService.query(c);
			if (setting.userForward !== settingConst.userForward.OPEN) return;

			const rows = await orm(c).select().from(accountForward)
				.where(and(
					eq(accountForward.accountId, emailRow.accountId),
					eq(accountForward.status, FORWARD_STATUS.ACTIVE)
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
				await orm(c).update(accountForward).set({ lastError: 'no send provider' })
					.where(and(
						eq(accountForward.accountId, emailRow.accountId),
						eq(accountForward.status, FORWARD_STATUS.ACTIVE)
					)).run();
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
						await orm(c).update(accountForward).set({ failCount: 0, lastError: '' })
							.where(eq(accountForward.forwardId, row.forwardId)).run();
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
		await orm(c).update(accountForward).set({
			failCount: sql`${accountForward.failCount} + 1`,
			lastError: formatLastError(message),
			status: sql`CASE WHEN ${accountForward.failCount} + 1 >= ${FORWARD_LIMITS.maxSendFails} THEN ${FORWARD_STATUS.FAILED} ELSE ${accountForward.status} END`
		}).where(and(
			eq(accountForward.forwardId, forwardId),
			eq(accountForward.status, FORWARD_STATUS.ACTIVE)
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

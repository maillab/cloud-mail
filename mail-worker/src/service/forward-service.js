import dayjs from 'dayjs';
import { and, asc, eq, inArray, getTableColumns } from 'drizzle-orm';
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
	checkVerifyCode,
	afterWrongCode,
	pickChannel,
	canUseForward,
	isForwardedMail,
	buildForwardParams,
	afterSendFailure
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

		await this.checkVerifyLimit(c, target, userId);

		const code = genVerifyCode();
		const now = Date.now();
		const inserted = await orm(c).insert(accountForward).values({
			accountId: accountRow.accountId,
			userId,
			targetEmail: target,
			status: FORWARD_STATUS.PENDING,
			verifyCode: code,
			verifyExpireTime: new Date(now + FORWARD_LIMITS.codeTtlMs).toISOString(),
			verifySendTime: new Date(now).toISOString()
		}).returning().get();

		try {
			await this.sendVerifyMail(c, channel, accountRow, target, code, lang, userId);
		} catch (e) {
			await orm(c).delete(accountForward).where(eq(accountForward.forwardId, inserted.forwardId)).run();
			throw e;
		}

		const { verifyCode, ...rest } = inserted;
		return rest;
	},

	async checkVerifyLimit(c, target, userId) {
		const targetKey = KvConst.FORWARD_VERIFY_TARGET + target;
		if (await c.env.kv.get(targetKey)) {
			throw new BizError(t('forwardVerifyTooFrequent'));
		}
		const dayCount = Number(await c.env.kv.get(this.dayKey(userId)) || 0);
		if (dayCount >= FORWARD_LIMITS.dailyVerifyLimit) {
			throw new BizError(t('forwardVerifyDayLimit'));
		}
	},

	dayKey(userId) {
		return KvConst.FORWARD_VERIFY_DAY + userId + ':' + dayjs().format('YYYY-MM-DD');
	},

	async sendVerifyMail(c, channel, accountRow, target, code, lang, userId) {
		const { subject, text, html } = forwardVerifyTemplate({ accountEmail: accountRow.email, code, lang });
		await this.deliver(c, channel, {
			accountEmail: accountRow.email,
			name: accountRow.name || emailUtils.getName(accountRow.email),
			receiveEmail: [target],
			subject,
			text,
			html
		});
		await c.env.kv.put(KvConst.FORWARD_VERIFY_TARGET + target, '1', { expirationTtl: FORWARD_LIMITS.targetCooldownSec });
		const dayCount = Number(await c.env.kv.get(this.dayKey(userId)) || 0);
		await c.env.kv.put(this.dayKey(userId), String(dayCount + 1), { expirationTtl: 86400 });
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

		await this.checkVerifyLimit(c, row.targetEmail, userId);

		const code = genVerifyCode();
		const now = Date.now();
		await orm(c).update(accountForward).set({
			verifyCode: code,
			verifyExpireTime: new Date(now + FORWARD_LIMITS.codeTtlMs).toISOString(),
			verifySendTime: new Date(now).toISOString(),
			verifyFailCount: 0
		}).where(eq(accountForward.forwardId, row.forwardId)).run();

		await this.sendVerifyMail(c, channel, accountRow, row.targetEmail, code, lang, userId);
	},

	async verify(c, { forwardId, code }, userId) {
		const { row } = await this.getOwnForward(c, forwardId, userId);
		if (row.status !== FORWARD_STATUS.PENDING) return;

		const res = checkVerifyCode(row, code, Date.now());

		if (res === 'ok') {
			await orm(c).update(accountForward).set({
				status: FORWARD_STATUS.ACTIVE,
				verifyCode: '',
				verifyFailCount: 0
			}).where(eq(accountForward.forwardId, row.forwardId)).run();
			return;
		}

		if (res === 'wrong') {
			await orm(c).update(accountForward).set(afterWrongCode(row))
				.where(eq(accountForward.forwardId, row.forwardId)).run();
			throw new BizError(t('forwardCodeWrong'));
		}

		throw new BizError(t('forwardCodeInvalid'));
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
					await this.deliver(c, channel, params);
					if (row.failCount > 0) {
						await orm(c).update(accountForward).set({ failCount: 0, lastError: '' })
							.where(eq(accountForward.forwardId, row.forwardId)).run();
					}
				} catch (e) {
					console.error('转发邮箱 ' + row.targetEmail + ' 失败：', e);
					try {
						await orm(c).update(accountForward).set(afterSendFailure(row, e.message))
							.where(eq(accountForward.forwardId, row.forwardId)).run();
					} catch (err) {
						console.error(err);
					}
				}
			}));
		} catch (e) {
			console.error('用户转发异常：', e);
		}
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

import BizError from '../error/biz-error';
import orm from '../entity/orm';
import user from '../entity/user';
import { eq } from 'drizzle-orm';
import KvConst from '../const/kv-const';
import { t } from '../i18n/i18n';
import totpUtils from '../utils/totp-utils';
import userService from './user-service';

const TOTP_ISSUER = 'Cloud Mail';

const totpService = {

	// 开始绑定：生成 secret，KV 暂存 5 分钟，返回明文 secret（手动输入用）+ otpauth URI（扫码用）
	async enroll(c, userId) {
		const userRow = await userService.selectById(c, userId);
		if (userRow.totpEnabled) {
			throw new BizError(t('totpAlreadyEnabled'));
		}
		const secret = totpUtils.generateSecret();
		await c.env.kv.put(KvConst.TOTP_PENDING + userId, secret, { expirationTtl: 300 });
		return {
			secret,
			otpauthUri: totpUtils.buildUri(secret, userRow.email, TOTP_ISSUER)
		};
	},

	// 确认绑定：校验码 → secret 加密写 D1 → 生成恢复码（明文只返回这一次）
	async confirm(c, userId, code) {
		const secret = await c.env.kv.get(KvConst.TOTP_PENDING + userId);
		if (!secret) {
			throw new BizError(t('totpEnrollExpired'));
		}
		if (!await totpUtils.verify(secret, code)) {
			throw new BizError(t('totpCodeInvalid'));
		}
		const encrypted = await totpUtils.encryptSecret(c.env.jwt_secret, secret);
		const recovery = await totpUtils.genRecoveryCodes();
		await orm(c).update(user).set({
			totpSecret: encrypted,
			totpEnabled: 1,
			totpRecovery: JSON.stringify(recovery.map(r => r.hash))
		}).where(eq(user.userId, userId)).run();
		await c.env.kv.delete(KvConst.TOTP_PENDING + userId);
		return { recoveryCodes: recovery.map(r => r.code) };
	},

	async disable(c, userId) {
		await orm(c).update(user).set({
			totpSecret: '',
			totpEnabled: 0,
			totpRecovery: ''
		}).where(eq(user.userId, userId)).run();
	},

	async status(c, userId) {
		const userRow = await userService.selectById(c, userId);
		return { enabled: userRow.totpEnabled === 1 };
	},

	// 重新生成恢复码（旧码全部作废）
	async regenerateRecoveryCodes(c, userId) {
		const userRow = await userService.selectById(c, userId);
		if (!userRow.totpEnabled) {
			throw new BizError(t('totpNotEnabled'));
		}
		const recovery = await totpUtils.genRecoveryCodes();
		await orm(c).update(user).set({
			totpRecovery: JSON.stringify(recovery.map(r => r.hash))
		}).where(eq(user.userId, userId)).run();
		return { recoveryCodes: recovery.map(r => r.code) };
	},

	// 登录第二步：验 TOTP 码
	async verifyCode(c, userId, code) {
		const userRow = await userService.selectById(c, userId);
		if (!userRow || !userRow.totpEnabled || !userRow.totpSecret) return false;
		const secret = await totpUtils.decryptSecret(c.env.jwt_secret, userRow.totpSecret);
		return totpUtils.verify(secret, code);
	},

	// 登录第二步：验恢复码（一次性，用过即删）
	async useRecoveryCode(c, userId, code) {
		const userRow = await userService.selectById(c, userId);
		if (!userRow || !userRow.totpEnabled) return false;
		let hashes = [];
		try {
			hashes = JSON.parse(userRow.totpRecovery || '[]');
		} catch (e) {
			return false;
		}
		const digest = await totpUtils.hashRecoveryCode(code);
		const idx = hashes.indexOf(digest);
		if (idx === -1) return false;
		hashes.splice(idx, 1);
		await orm(c).update(user).set({
			totpRecovery: JSON.stringify(hashes)
		}).where(eq(user.userId, userId)).run();
		return true;
	}
};

export default totpService;

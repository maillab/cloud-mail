import emailService from './email-service';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';

const resendService = {

	/**
	 * 校验 Resend webhook 的 Svix 签名。
	 * 未配置 RESEND_WEBHOOK_SECRET 时保持原行为（不校验）；
	 * 配置后签名缺失/错误/过期一律拒绝。
	 * Secret 取自 Resend 后台 Webhook 端点的 Signing Secret（whsec_ 开头），
	 * 用 wrangler secret put RESEND_WEBHOOK_SECRET 设置。
	 */
	async verifyWebhook(c, rawBody) {

		const secret = c.env.RESEND_WEBHOOK_SECRET;

		if (!secret) {
			return true;
		}

		const svixId = c.req.header('svix-id');
		const svixTimestamp = c.req.header('svix-timestamp');
		const svixSignature = c.req.header('svix-signature');

		if (!svixId || !svixTimestamp || !svixSignature) {
			return false;
		}

		// 时间戳容差 5 分钟，防重放
		const ts = Number(svixTimestamp);
		if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
			return false;
		}

		try {
			const keyB64 = secret.replace(/^whsec_/, '');
			const keyBytes = Uint8Array.from(atob(keyB64), ch => ch.charCodeAt(0));
			const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
			const payload = new TextEncoder().encode(`${svixId}.${svixTimestamp}.${rawBody}`);
			const mac = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, payload));
			const expected = 'v1,' + btoa(String.fromCharCode(...mac));
			// 常量时间比较，Resend 可能轮换密钥，逐个比对 header 里的签名
			return svixSignature.split(' ').some(sig => {
				if (sig.length !== expected.length) return false;
				let diff = 0;
				for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
				return diff === 0;
			});
		} catch (e) {
			return false;
		}
	},

	async webhooks(c, body) {

		const params = {
			resendEmailId: body.data.email_id,
			status: emailConst.status.SENT
		}

		if (body.type === 'email.delivered') {
			params.status = emailConst.status.DELIVERED
			params.message = null
		}

		if (body.type === 'email.complained') {
			params.status = emailConst.status.COMPLAINED
			params.message = null
		}

		if (body.type === 'email.bounced') {
			let bounce = body.data.bounce
			bounce = JSON.stringify(bounce);
			params.status = emailConst.status.BOUNCED
			params.message = bounce
		}

		if (body.type === 'email.delivery_delayed') {
			params.status = emailConst.status.DELAYED
			params.message = null
		}

		if (body.type === 'email.failed') {
			params.status = emailConst.status.FAILED
			params.message = body.data.failed.reason
		}

		const emailRow = await emailService.updateEmailStatus(c, params)

		if (!emailRow) {
			throw new BizError('更新邮件状态记录失败');
		}

	}
}

export default resendService

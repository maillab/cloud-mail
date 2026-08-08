import emailService from './email-service';
import { emailConst } from '../const/entity-const';

const STATUS_BY_EVENT = {
	'email.sent': emailConst.status.SENT,
	'email.delivered': emailConst.status.DELIVERED,
	'email.complained': emailConst.status.COMPLAINED,
	'email.bounced': emailConst.status.BOUNCED,
	'email.delivery_delayed': emailConst.status.DELAYED,
	'email.failed': emailConst.status.FAILED
};

const resendService = {
	async webhooks(c, body) {
		if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
		const status = STATUS_BY_EVENT[body.type];
		const resendEmailId = body?.data?.email_id;
		if (status === undefined || typeof resendEmailId !== 'string' || !resendEmailId || resendEmailId.length > 256) {
			return false;
		}

		let message = null;
		if (body.type === 'email.bounced') {
			message = JSON.stringify(body.data?.bounce || {}).slice(0, 10_000);
		} else if (body.type === 'email.failed') {
			message = String(body.data?.failed?.reason || 'unknown').slice(0, 2000);
		}

		await emailService.updateEmailStatus(c, { resendEmailId, status, message });
		return true;
	}
};

export default resendService;

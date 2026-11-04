import emailDao from '../dao/email-dao';
import { sql } from 'drizzle-orm';
import type { EnvContext } from '../types/context';
import type { EmailStatusUpdate } from '../types/email';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';

const resendService = {

	async webhooks(c: EnvContext, body: unknown): Promise<void> {

		const data = property(body, 'data');
		const params: EmailStatusUpdate = {
			resendEmailId: sql`${sql.param(property(data, 'email_id'))}`,
			status: emailConst.status.SENT
		}

		if (property(body, 'type') === 'email.delivered') {
			params.status = emailConst.status.DELIVERED
			params.message = null
		}

		if (property(body, 'type') === 'email.complained') {
			params.status = emailConst.status.COMPLAINED
			params.message = null
		}

		if (property(body, 'type') === 'email.bounced') {
			const bounce = JSON.stringify(property(data, 'bounce'));
			params.status = emailConst.status.BOUNCED
			params.message = bounce
		}

		if (property(body, 'type') === 'email.delivery_delayed') {
			params.status = emailConst.status.DELAYED
			params.message = null
		}

		if (property(body, 'type') === 'email.failed') {
			params.status = emailConst.status.FAILED
			const reason = property(property(data, 'failed'), 'reason');
			params.message = typeof reason === 'string' || reason == null ? reason : sql`${sql.param(reason)}`
		}

		const emailRow = await emailDao.updateEmailStatus(c, params)

		if (!emailRow) {
			throw new BizError('更新邮件状态记录失败');
		}

	}
}

export default resendService

// Provider JSON stays unknown; preserve the existing property-access failure points.
function property(value: unknown, key: string): unknown {
	if (value == null) throw new TypeError(`Cannot read properties of ${String(value)} (reading '${key}')`);
	return typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

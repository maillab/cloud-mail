import domainUtils from '../utils/domain-uitls';
import type { EnvContext } from '../types/context';
import type email from '../entity/email';

type ReceivedMail = typeof email.$inferSelect;

const webhookService = {

	async sendEmail(_c: EnvContext, emailRow: ReceivedMail, webhookUrl: string, retry: number | string = 0, webhookSecret?: string): Promise<void> {

		const normalizedUrl = domainUtils.toOssDomain(webhookUrl);

		if (!normalizedUrl) {
			return;
		}

		retry = Number(retry);
		if (isNaN(retry) || retry < 0) {
			retry = 0;
		}

		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};

		if (webhookSecret) {
			headers['Authorization'] = webhookSecret;
		}

		const body = JSON.stringify({
			emailId: emailRow.emailId,
			sendEmail: emailRow.sendEmail,
			sendName: emailRow.name,
			toEmail: emailRow.toEmail,
			toName: emailRow.toName,
			subject: emailRow.subject,
			text: emailRow.text,
			content: emailRow.content,
			code: emailRow.code,
			createTime: emailRow.createTime
		});

		let lastError = '';

		for (let i = 0; i <= retry; i++) {
			try {
				const res = await fetch(normalizedUrl, {
					method: 'POST',
					headers,
					body
				});

				if (res.ok) {
					return;
				}

				lastError = `status: ${res.status} response: ${await res.text()}`;
			} catch (e) {
				lastError = e instanceof Error ? e.message : String(e);
			}
		}

		console.error(`Webhook 推送失败: ${lastError}`);
	}

};

export default webhookService;

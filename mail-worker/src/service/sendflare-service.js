import emailService from './email-service';
import BizError from '../error/biz-error';
import { emailConst } from '../const/entity-const';

const API_BASE = 'https://api.sendflare.com';

const sendflareService = {

	// 单封接口的 to 只接受一个地址，其余收件人放入抄送。
	async send(token, params) {
		const [to, ...cc] = params.receiveEmail;
		const form = await this.toSendForm(params);
		form.to = to;
		if (cc.length > 0) form.cc = cc;
		const data = await this.request(token, '/v1/send', form);
		// 文档示例的返回字段拼写为 emilId，兼容两种写法。
		return data?.emailId || data?.emilId;
	},

	// 批量接口为每位收件人生成独立邮件，返回的 ID 按收件人顺序排列。
	async batchSend(token, params) {
		const form = await this.toSendForm(params);
		form.to = [...params.receiveEmail];
		return await this.request(token, '/v1/batchSend', form);
	},

	async toSendForm(params) {
		const form = {
			from: `${params.name} <${params.accountEmail}>`,
			subject: params.subject,
			body: params.html || params.text || ''
		};

		if (params.sendType === 'reply' && params.messageId) {
			form.header = {
				'In-Reply-To': params.messageId,
				'References': params.messageId
			};
		}

		const attachments = [];
		for (const attachment of params.attachments || []) {
			const content = await emailService.toAttachmentBase64(attachment);
			if (!content) continue;
			const item = {
				filename: attachment.filename,
				content,
				contentType: attachment.contentType || attachment.mimeType || attachment.type || 'application/octet-stream',
				disposition: attachment.contentId ? 'inline' : 'attachment'
			};
			if (attachment.contentId) {
				item.contentId = attachment.contentId.replace(/^<|>$/g, '');
			}
			attachments.push(item);
		}
		if (attachments.length > 0) form.attachments = attachments;

		return form;
	},

	async request(token, path, body) {
		const res = await fetch(API_BASE + path, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				'Authorization': `Bearer ${token}`
			},
			body: JSON.stringify(body)
		});

		let result;
		try {
			result = await res.json();
		} catch {
			throw new BizError(`Sendflare HTTP ${res.status}`);
		}

		if (!res.ok || result.code !== 0) {
			throw new BizError(`Sendflare: ${result.message || 'HTTP ' + res.status} (${result.code ?? res.status})`);
		}

		return result.data;
	},

	// 签名只覆盖 nonce 和请求 ID：md5(nonce|requestId|secret|nonce)。
	async verify(c) {
		const secret = c.env.sendflare_webhook_secret;
		if (!secret) return true;
		const nonce = c.req.header('x-sf-webhook-nonce') || '';
		const requestId = c.req.header('x-sf-request-id') || '';
		const signature = (c.req.header('x-sf-signature') || '').toLowerCase();
		const digest = await crypto.subtle.digest('MD5', new TextEncoder().encode(`${nonce}|${requestId}|${secret}|${nonce}`));
		const expected = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
		return signature === expected;
	},

	async webhooks(c, body) {
		// 文档中同时出现 {type, data} 包装和扁平两种结构。
		const data = body.data || body;

		const params = {
			resendEmailId: data.emailId,
			message: null
		};

		if (body.type === 'email.delivered') {
			params.status = emailConst.status.DELIVERED;
		} else if (body.type === 'email.complaint') {
			params.status = emailConst.status.COMPLAINED;
		} else if (body.type === 'email.bounced') {
			params.status = emailConst.status.BOUNCED;
			params.message = JSON.stringify(data.bounce);
		} else {
			// sent/opened/clicked 不改变投递状态，避免把已送达回退成已发送。
			return;
		}

		const emailRow = await emailService.updateEmailStatus(c, params);

		if (!emailRow) {
			console.warn(`sendflare webhook: unknown emailId ${params.resendEmailId}, type ${body.type}`);
		}
	}
};

export default sendflareService;

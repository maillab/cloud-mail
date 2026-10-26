import BizError from '../error/biz-error.js';

const mailjetService = {

	// 调用方先统一转换附件为 Base64，再区分普通附件和正文 CID 图片。
	buildMessage(params) {
		const message = {
			From: { Email: params.accountEmail, Name: params.name },
			To: params.receiveEmail.map(Email => ({ Email })),
			Subject: params.subject
		};
		if (params.text) message.TextPart = params.text;
		if (params.html) message.HTMLPart = params.html;
		if (params.sendType === 'reply' && params.messageId) {
			message.Headers = {
				'In-Reply-To': params.messageId,
				'References': params.messageId
			};
		}
		for (const attachment of params.attachments || []) {
			const item = {
				ContentType: attachment.contentType,
				Filename: attachment.filename,
				Base64Content: attachment.content
			};
			const key = attachment.contentId ? 'InlinedAttachments' : 'Attachments';
			if (attachment.contentId) {
				item.ContentID = attachment.contentId.replace(/^<|>$/g, '');
			}
			(message[key] ||= []).push(item);
		}
		return message;
	},

	async send(credentials, messages, { sandbox = false } = {}) {
		const response = await fetch('https://api.mailjet.com/v3.1/send', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Basic ${btoa(`${credentials.apiKey}:${credentials.secretKey}`)}`
			},
			body: JSON.stringify({ Messages: messages, ...(sandbox ? { SandboxMode: true } : {}) }),
			signal: AbortSignal.timeout(30000)
		});
		const result = await response.json().catch(() => null);
		// 批量请求即使部分消息失败，也要交回逐封结果以保存已成功的邮件。
		if (Array.isArray(result?.Messages) && result.Messages.length > 0) {
			return result.Messages;
		}
		throw new BizError(result?.ErrorMessage || `Mailjet request failed (HTTP ${response.status})`);
	},

	errorMessage(result) {
		return result?.Errors?.map(error => error.ErrorMessage || error.ErrorCode).filter(Boolean).join('; ')
			|| 'Mailjet returned an invalid send result';
	}
};

export default mailjetService;

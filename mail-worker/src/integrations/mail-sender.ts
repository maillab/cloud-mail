import { Resend } from 'resend';
import type { CreateEmailOptions } from 'resend';
import fileUtils from '../utils/file-utils';
import { requiredRow } from '../lib/required-row';
import type { EnvContext } from '../types/context';
import type { ProviderMail, ProviderResult } from '../types/email';
import type { OutboundAttachment } from '../types/attachment';

interface LegacyNativeAttachment { content: ArrayBuffer; filename?: string | null; type: string | number; disposition: 'inline' | 'attachment'; contentId?: string }
interface NativeForm { from: { email: string; name: string }; to: string[]; subject?: string; text?: string; html?: string; attachments?: LegacyNativeAttachment[]; headers?: Record<string, string> }
type ResendAttachment = Omit<OutboundAttachment, 'content' | 'contentType'> & { content: string; contentType: string | number };
interface ResendForm { from: string; to: string[]; subject?: string; text?: string; html: string; attachments: ResendAttachment[]; headers?: Record<string, string | null | undefined> }

const mailSender = {
	async sendByCloudflareEmail(c: EnvContext, params: ProviderMail): Promise<ProviderResult> {
		const sendForm: NativeForm = {
			from: { email: params.accountEmail, name: params.name },
			to: [...params.receiveEmail],
			subject: params.subject
		};

		if (params.text) {
			sendForm.text = params.text;
		}

		if (params.html) {
			sendForm.html = params.html;
		}

		const attachments = await this.toCloudflareAttachments(params.attachments);
		if (attachments.length > 0) {
			sendForm.attachments = attachments;
		}

		if (params.sendType === 'reply' && params.messageId) {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.messageId
			};
		}

		// Preserve legacy nullable/missing wire fields rather than normalizing them.
		// The native builder validates the payload; protocol fixtures cover its bytes.
		const result = await requiredRow(c.env.email, 'send').send(sendForm as Parameters<SendEmail['send']>[0]);

		return {
			data: {
				id: result.messageId
			}
		};
	},

	async sendByResend(resendToken: unknown, params: ProviderMail): Promise<ProviderResult> {
		// The business branch retains the original JSON value and truthiness. Let
		// the pinned SDK handle malformed historical tokens at its original boundary.
		const resend = new Resend(resendToken as ConstructorParameters<typeof Resend>[0]);

		const sendForm: ResendForm = {
			from: `${params.name} <${params.accountEmail}>`,
			to: [...params.receiveEmail],
			subject: params.subject,
			text: params.text,
			html: params.html,
			attachments: await this.toResendAttachments(params.attachments)
		};

		if (params.sendType === 'reply') {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.messageId
			};
		}

		return await resend.emails.send(sendForm as CreateEmailOptions);
	},

	async toCloudflareAttachments(attachments: OutboundAttachment[]): Promise<LegacyNativeAttachment[]> {
		const arrayBufferAttachments = await this.toArrayBufferAttachments(attachments);

		return arrayBufferAttachments.map(attachment => {
			const item: LegacyNativeAttachment = {
				content: attachment.content,
				filename: attachment.filename,
				type: attachment.mimeType || attachment.contentType || attachment.type || 'application/octet-stream',
				disposition: attachment.contentId ? 'inline' : 'attachment'
			};

			if (attachment.contentId) {
				item.contentId = attachment.contentId.replace(/^<|>$/g, '');
			}

			return item;
		});
	},

	async toResendAttachments(attachments: OutboundAttachment[] = []): Promise<ResendAttachment[]> {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentBase64(attachment);
			if (!content) {
				continue;
			}

			result.push({
				...attachment,
				content,
				contentType: attachment.contentType || attachment.mimeType || attachment.type || 'application/octet-stream'
			});
		}

		return result;
	},

	async toArrayBufferAttachments(attachments: OutboundAttachment[] = []): Promise<(OutboundAttachment & { content: ArrayBuffer })[]> {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentArrayBuffer(attachment);
			if (!content) {
				continue;
			}

			result.push({ ...attachment, content });
		}

		return result;
	},

	async toAttachmentBase64(attachment: OutboundAttachment): Promise<string | null> {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return content.replace(/\s+/g, '');
		}

		const arrayBuffer = await this.toAttachmentArrayBuffer(attachment);
		if (!arrayBuffer) {
			return null;
		}

		const bytes = new Uint8Array(arrayBuffer);
		let binary = '';

		for (let i = 0; i < bytes.length; i += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		}

		return btoa(binary);
	},

	async toAttachmentArrayBuffer(attachment: OutboundAttachment): Promise<ArrayBuffer | null> {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (content instanceof ArrayBuffer) {
			return content;
		}

		if (content instanceof Uint8Array) {
			return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return fileUtils.base64ToUint8Array(content.replace(/\s+/g, '')).buffer;
		}

		return content;
	},

};
export default mailSender;

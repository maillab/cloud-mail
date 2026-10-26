import { beforeEach, describe, expect, it, vi } from 'vitest';

// 隔离数据库、存储和站内投递，覆盖公共发送入口及真实 Mailjet 负载构造。
vi.mock('../../src/entity/orm', () => ({ default: vi.fn() }));
vi.mock('../../src/i18n/i18n', () => ({ t: key => key }));
vi.mock('../../src/service/setting-service', () => ({ default: { query: vi.fn() } }));
vi.mock('../../src/service/account-service', () => ({ default: { selectById: vi.fn() } }));
vi.mock('../../src/service/user-service', () => ({ default: { selectById: vi.fn() } }));
vi.mock('../../src/service/role-service', () => ({ default: { selectById: vi.fn(), hasAvailDomainPerm: () => true } }));
vi.mock('../../src/service/att-service', () => ({ default: { toImageUrlHtml: vi.fn() } }));
vi.mock('../../src/service/star-service', () => ({ default: {} }));
vi.mock('../../src/service/telegram-service', () => ({ default: {} }));
vi.mock('../../src/service/webhook-service', () => ({ default: {} }));
vi.mock('../../src/utils/forward-mime', () => ({ default: {} }));
vi.mock('../../src/service/verify-record-service', () => ({ default: {} }));

import emailService from '../../src/service/email-service';
import mailjetService from '../../src/service/mailjet-service';
import settingService from '../../src/service/setting-service';
import accountService from '../../src/service/account-service';
import userService from '../../src/service/user-service';
import roleService from '../../src/service/role-service';
import attService from '../../src/service/att-service';

const credentials = { apiKey: 'key', secretKey: 'secret' };
const sendParams = {
	accountEmail: 'sender@example.com', name: 'Sender', subject: 'Subject',
	text: 'Hello', html: '<p>Hello</p>', attachments: [],
	receiveEmail: ['one@example.net', 'two@example.net', 'three@example.net']
};
const success = id => ({ Status: 'success', To: [{ MessageUUID: id }] });
const collect = async generator => {
	const results = [];
	for await (const result of generator) results.push(result);
	return results;
};

beforeEach(() => {
	vi.spyOn(emailService, 'saveSentEmail').mockImplementation(async (_, params) => ({
		...params, recipient: JSON.stringify(params.receiveEmail.map(address => ({ address })))
	}));
});

describe('Mailjet delivery records and partial failures', () => {
	it('sends shared recipients as one message and saves one record', async () => {
		const send = vi.spyOn(mailjetService, 'send').mockResolvedValue([success('id')]);
		const results = await collect(emailService.sendMailjet({}, {
			separate: false, mailjetToken: credentials, sendParams, saveParams: {}
		}));
		expect(send.mock.calls[0][1]).toHaveLength(1);
		expect(send.mock.calls[0][1][0].To).toHaveLength(3);
		expect(results[0].emails[0].providerId).toBe('mailjet:id');
		expect(emailService.saveSentEmail).toHaveBeenCalledTimes(1);
	});

	it('saves successes after a failed item in the same batch', async () => {
		vi.spyOn(mailjetService, 'send').mockResolvedValue([
			success('one'), { Status: 'error', Errors: [{ ErrorMessage: 'Invalid recipient' }] }, success('three')
		]);
		const results = await collect(emailService.sendMailjet({}, {
			separate: true, mailjetToken: credentials, sendParams, saveParams: {}
		}));
		expect(results[0].emails.map(item => item.receiveEmail[0])).toEqual(['one@example.net', 'three@example.net']);
		expect(results[1].error.message).toBe('Invalid recipient');
		expect(emailService.saveSentEmail).toHaveBeenCalledTimes(2);
	});

	it('splits separate sends into batches of 50 and retains successes before a network failure', async () => {
		const send = vi.spyOn(mailjetService, 'send')
			.mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => success(`${i}`)))
			.mockRejectedValueOnce(new Error('Network failure'));
		const results = await collect(emailService.sendMailjet({}, {
			separate: true, mailjetToken: credentials, saveParams: {},
			sendParams: { ...sendParams, receiveEmail: Array.from({ length: 101 }, (_, i) => `user${i}@example.net`) }
		}));
		expect(send.mock.calls.map(call => call[1].length)).toEqual([50, 50]);
		expect(send.mock.calls[0][1].every(message => message.To.length === 1)).toBe(true);
		expect(results[0].emails).toHaveLength(50);
		expect(results[1].error.message).toBe('Network failure');
	});

	it('treats missing result entries as failures', async () => {
		vi.spyOn(mailjetService, 'send').mockResolvedValue([success('one')]);
		const results = await collect(emailService.sendMailjet({}, {
			separate: true, mailjetToken: credentials, sendParams, saveParams: {}
		}));
		expect(results[0].emails).toHaveLength(1);
		expect(results[1].error.message).toContain('invalid send result');
	});

	it('normalizes binary and data-URL attachments before mapping Mailjet fields', async () => {
		const send = vi.spyOn(mailjetService, 'send').mockResolvedValue([success('one')]);
		await collect(emailService.sendMailjet({}, {
			separate: false, mailjetToken: credentials, saveParams: {},
			sendParams: { ...sendParams, attachments: [
				{ filename: 'binary.txt', mimeType: 'text/plain', content: new Uint8Array([65, 66]) },
				{ filename: 'image.png', mimeType: 'image/png', content: 'data:image/png;base64, QUI=\n', contentId: '<image>' }
			] }
		}));
		const message = send.mock.calls[0][1][0];
		expect(message.Attachments[0]).toEqual({ Filename: 'binary.txt', ContentType: 'text/plain', Base64Content: 'QUI=' });
		expect(message.InlinedAttachments[0]).toMatchObject({ ContentID: 'image', ContentType: 'image/png', Base64Content: 'QUI=' });
	});
});

describe('shared send entry point', () => {
	let c;
	let params;
	beforeEach(() => {
		c = { env: { admin: 'admin@example.com', email: { send: vi.fn() } } };
		params = { ...sendParams, accountId: 1, content: sendParams.html };
		settingService.query.mockResolvedValue({
			mailjetTokens: { 'example.com': credentials }, resendTokens: { 'example.com': 'resend-key' },
			send: 0, domainList: ['@example.com']
		});
		accountService.selectById.mockResolvedValue({ userId: 1, email: sendParams.accountEmail });
		userService.selectById.mockResolvedValue({ email: 'admin@example.com' });
		roleService.selectById.mockResolvedValue({});
		attService.toImageUrlHtml.mockResolvedValue({ html: sendParams.html, imageDataList: [] });
	});

	it('selects Mailjet over configured Cloudflare and Resend and returns only failed recipients', async () => {
		vi.spyOn(mailjetService, 'send').mockResolvedValue([
			success('one'), { Status: 'error', Errors: [{ ErrorMessage: 'Invalid recipient' }] }, success('three')
		]);
		const result = await emailService.send(c, { ...params, manyType: 'divide' }, 1);
		expect(result.emails).toHaveLength(2);
		expect(result.failedRecipients).toEqual(['two@example.net']);
		expect(result.error).toBe('Invalid recipient');
		expect(c.env.email.send).not.toHaveBeenCalled();
		expect(result.emails.every(item => item.useCloudflareEmail === false)).toBe(true);
	});

	it('surfaces per-message Mailjet errors during ordinary sending', async () => {
		vi.spyOn(mailjetService, 'send').mockResolvedValue([{ Status: 'error', Errors: [{ ErrorMessage: 'Sender not verified' }] }]);
		await expect(emailService.send(c, params, 1)).rejects.toThrow('Sender not verified');
		expect(emailService.saveSentEmail).not.toHaveBeenCalled();
	});

	it('keeps internal-only recipients on local delivery', async () => {
		const internal = vi.spyOn(emailService, 'sendInternal').mockImplementation(async function* () {
			yield { emails: [{ recipient: '[{"address":"local@example.com"}]' }] };
		});
		const mailjet = vi.spyOn(mailjetService, 'send');
		await emailService.send(c, { ...params, receiveEmail: ['local@example.com'] }, 1);
		expect(internal).toHaveBeenCalledOnce();
		expect(mailjet).not.toHaveBeenCalled();
	});

	it.each(['cloudflare', 'resend'])('keeps the existing %s route for domains without Mailjet', async provider => {
		settingService.query.mockResolvedValue({ resendTokens: { 'example.com': 'resend-key' }, send: 0, domainList: ['@example.com'] });
		if (provider === 'resend') delete c.env.email;
		const route = vi.spyOn(emailService, provider === 'resend' ? 'sendResend' : 'sendCloudflare')
			.mockImplementation(async function* () { yield { emails: [] }; });
		await emailService.send(c, params, 1);
		expect(route).toHaveBeenCalledOnce();
	});
});

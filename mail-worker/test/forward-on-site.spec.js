import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import emailService from '../src/service/email-service';
import settingService from '../src/service/setting-service';
import telegramService from '../src/service/telegram-service';
import webhookService from '../src/service/webhook-service';
import { settingConst } from '../src/const/entity-const';

const c = { env: {} };
const sendParams = { accountEmail: 'admin@example.com', name: 'admin', subject: 'hi', text: 'hi', html: '<p>hi</p>', attachments: [] };
const rows = [{ emailId: 1, toEmail: 'bob@example.com' }, { emailId: 2, toEmail: 'carol@example.com' }];

const setting = (overrides = {}) => vi.spyOn(settingService, 'query').mockResolvedValue({
	tgBotStatus: settingConst.tgBotStatus.OPEN, tgChatId: '1',
	webhookStatus: settingConst.webhookStatus.OPEN, webhookUrl: 'https://hook.test', webhookRetry: 0, webhookSecret: '',
	forwardStatus: settingConst.forwardStatus.OPEN, forwardEmail: 'a@out.test,b@out.test',
	ruleType: settingConst.ruleType.ALL, ruleEmail: '',
	...overrides
});

describe('forwardOnSiteEmail', () => {
	let tg, hook, cf, resend;

	beforeEach(() => {
		tg = vi.spyOn(telegramService, 'sendEmailToBot').mockResolvedValue();
		hook = vi.spyOn(webhookService, 'sendEmail').mockResolvedValue();
		cf = vi.spyOn(emailService, 'sendByCloudflareEmail').mockResolvedValue({ data: { id: 'x' } });
		resend = vi.spyOn(emailService, 'sendByResend').mockResolvedValue({ data: { id: 'x' } });
	});

	afterEach(() => vi.restoreAllMocks());

	it('pushes every saved copy and forwards once per address in all mode', async () => {
		setting();
		await emailService.forwardOnSiteEmail(c, rows, { useCloudflareEmail: true, resendToken: 'tok', sendParams: { ...sendParams, receiveEmail: ['bob@example.com', 'carol@example.com'] } });
		expect(tg.mock.calls.map(call => call[1].emailId)).toEqual([1, 2]);
		expect(hook.mock.calls.map(call => call[1].emailId)).toEqual([1, 2]);
		expect(cf.mock.calls.map(call => call[1].receiveEmail)).toEqual([['a@out.test'], ['b@out.test']]);
		expect(resend).not.toHaveBeenCalled();
	});

	it('only forwards recipients in the rule list', async () => {
		setting({ ruleType: settingConst.ruleType.RULE, ruleEmail: 'carol@example.com' });
		await emailService.forwardOnSiteEmail(c, rows, { useCloudflareEmail: true, sendParams });
		expect(tg.mock.calls.map(call => call[1].emailId)).toEqual([2]);
		expect(hook.mock.calls.map(call => call[1].emailId)).toEqual([2]);
		expect(cf).toHaveBeenCalledTimes(2);
	});

	it('does nothing when no recipient matches the rule list', async () => {
		setting({ ruleType: settingConst.ruleType.RULE, ruleEmail: 'dave@example.com' });
		await emailService.forwardOnSiteEmail(c, rows, { useCloudflareEmail: true, sendParams });
		expect(tg).not.toHaveBeenCalled();
		expect(hook).not.toHaveBeenCalled();
		expect(cf).not.toHaveBeenCalled();
	});

	it('falls back to Resend without a send_email binding', async () => {
		setting();
		await emailService.forwardOnSiteEmail(c, rows, { useCloudflareEmail: false, resendToken: 'tok', sendParams });
		expect(resend.mock.calls.map(call => [call[0], call[1].receiveEmail])).toEqual([['tok', ['a@out.test']], ['tok', ['b@out.test']]]);
		expect(cf).not.toHaveBeenCalled();
	});

	it('warns and skips other-email forwarding without a send provider', async () => {
		setting();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await emailService.forwardOnSiteEmail(c, rows, { useCloudflareEmail: false, sendParams });
		expect(warn).toHaveBeenCalledOnce();
		expect(cf).not.toHaveBeenCalled();
		expect(resend).not.toHaveBeenCalled();
		expect(hook).toHaveBeenCalledTimes(2);
	});

	it('does not throw when forwarding fails', async () => {
		setting();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		cf.mockRejectedValueOnce(new Error('boom'));
		resend.mockResolvedValue({ error: { message: 'bad' } });
		await expect(emailService.forwardOnSiteEmail(c, rows, { useCloudflareEmail: true, sendParams })).resolves.toBeUndefined();
		await expect(emailService.forwardOnSiteEmail(c, rows, { useCloudflareEmail: false, resendToken: 'tok', sendParams })).resolves.toBeUndefined();
		expect(error).toHaveBeenCalledTimes(3);
	});
});

describe('sendInternal', () => {
	afterEach(() => vi.restoreAllMocks());

	it('forwards each divided send with its own recipient', async () => {
		vi.spyOn(emailService, 'saveSentEmail').mockImplementation(async (c, { receiveEmail }) => ({ receiveEmail, attList: [] }));
		vi.spyOn(emailService, 'HandleOnSiteEmail').mockImplementation(async (c, receiveEmail) => receiveEmail.map(toEmail => ({ toEmail })));
		const forward = vi.spyOn(emailService, 'forwardOnSiteEmail').mockResolvedValue();
		const params = { ...sendParams, receiveEmail: ['bob@example.com', 'carol@example.com'] };
		for await (const _ of emailService.sendInternal(c, { separate: true, useCloudflareEmail: true, resendToken: 'tok', sendParams: params, saveParams: {} })) {}
		expect(forward.mock.calls.map(call => [call[1], call[2].sendParams.receiveEmail])).toEqual([
			[[{ toEmail: 'bob@example.com' }], ['bob@example.com']],
			[[{ toEmail: 'carol@example.com' }], ['carol@example.com']]
		]);
		expect(forward.mock.calls[0][2]).toMatchObject({ useCloudflareEmail: true, resendToken: 'tok' });
	});
});

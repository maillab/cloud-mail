import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/entity/orm', () => ({ default: vi.fn() }));
vi.mock('../../src/i18n/i18n', () => ({ t: key => key }));
vi.mock('../../src/service/r2-service', () => ({ default: { storageType: vi.fn().mockResolvedValue('r2') } }));
vi.mock('../../src/service/verify-record-service', () => ({ default: { selectListByIP: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../src/security/user-context', () => ({ default: { getToken: vi.fn().mockResolvedValue('token') } }));

import settingService from '../../src/service/setting-service';
import orm from '../../src/entity/orm';
import verifyRecordService from '../../src/service/verify-record-service';
import r2Service from '../../src/service/r2-service';
import userContext from '../../src/security/user-context';

const credentials = { apiKey: 'private-api-key', secretKey: 'private-secret-key' };
let settings;
let c;
let set;

beforeEach(() => {
	settings = {
		mailjetTokens: { 'example.com': { ...credentials }, 'other.com': { ...credentials } },
		resendTokens: { 'example.com': 'resend-api-key' }
	};
	c = { env: {} };
	verifyRecordService.selectListByIP.mockResolvedValue([]);
	r2Service.storageType.mockResolvedValue('r2');
	userContext.getToken.mockResolvedValue('token');
	set = vi.fn().mockReturnValue({ returning: () => ({ get: async () => ({}) }) });
	orm.mockReturnValue({ update: () => ({ set }) });
	vi.spyOn(settingService, 'query').mockResolvedValue(settings);
	vi.spyOn(settingService, 'refresh').mockResolvedValue();
});

describe('Mailjet settings', () => {
	it('merges domain credentials, trims input and keeps other domains', async () => {
		await settingService.set(c, { mailjetTokens: { 'example.com': { apiKey: ' new-key ', secretKey: ' new-secret ' } } });
		expect(JSON.parse(set.mock.calls[0][0].mailjetTokens)).toEqual({
			'example.com': { apiKey: 'new-key', secretKey: 'new-secret' },
			'other.com': credentials
		});
		expect(settingService.refresh).toHaveBeenCalledOnce();
	});

	it('deletes only the selected domain', async () => {
		await settingService.set(c, { mailjetTokens: { 'example.com': null } });
		expect(JSON.parse(set.mock.calls[0][0].mailjetTokens)).toEqual({ 'other.com': credentials });
	});

	it('does not write Mailjet credentials during unrelated setting changes', async () => {
		await settingService.set(c, { title: 'New title' });
		expect(set.mock.calls[0][0]).not.toHaveProperty('mailjetTokens');
	});

	it.each([
		null, [], 'invalid',
		{ 'example.com': { apiKey: 'key' } },
		{ 'example.com': { apiKey: '', secretKey: 'secret' } },
		{ 'example.com': { apiKey: '******', secretKey: '******' } },
		{ 'example.com': { apiKey: 'key:invalid', secretKey: 'secret' } },
		{ 'example.com': { apiKey: 'key', secretKey: 'secret\ninvalid' } }
	])('rejects malformed or masked credentials: %j', async mailjetTokens => {
		await expect(settingService.set(c, { mailjetTokens })).rejects.toThrow('invalidMailjetCredentials');
		expect(set).not.toHaveBeenCalled();
	});

	it('masks both keys without mutating cached credentials', async () => {
		const result = await settingService.get(c);
		expect(result.mailjetTokens['example.com']).toEqual({ apiKey: '******', secretKey: '******' });
		expect(JSON.stringify(result)).not.toContain(credentials.apiKey);
		expect(JSON.stringify(result)).not.toContain(credentials.secretKey);
		expect(settings.mailjetTokens['example.com']).toEqual(credentials);
		expect(settings.resendTokens['example.com']).toBe('resend-api-key');
	});

	it('does not expose Mailjet configuration in public website settings', async () => {
		const result = await settingService.websiteConfig(c);
		expect(result).not.toHaveProperty('mailjetTokens');
		expect(JSON.stringify(result)).not.toContain(credentials.secretKey);
	});

	it('handles cached settings created before Mailjet was added', async () => {
		delete settings.mailjetTokens;
		expect((await settingService.get(c)).mailjetTokens).toEqual({});
		await settingService.set(c, { mailjetTokens: { 'example.com': credentials } });
		expect(JSON.parse(set.mock.calls[0][0].mailjetTokens)).toEqual({ 'example.com': credentials });
	});
});

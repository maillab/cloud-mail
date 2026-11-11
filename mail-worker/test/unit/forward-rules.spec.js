import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	FORWARD_LIMITS, validateTarget, genVerifyCode, matchVerifyCode, isCodeExhausted,
	formatLastError, withTimeout, pickChannel, canUseForward, isForwardedMail, sanitizeDisplayName, buildForwardParams
} from '../../src/lib/forward-rules.js';

const domainList = ['@example.com', '@example2.com'];
const base = { accountEmail: 'alice@example.com', domainList, existingTargets: [] };

describe('validateTarget', () => {
	it('接受外部地址', () => expect(validateTarget({ ...base, target: 'me@gmail.com' })).toBeNull());
	it('拒绝非法格式', () => expect(validateTarget({ ...base, target: 'not-an-email' })).toBe('notEmail'));
	it('站内域名不区分大小写并忽略空格', () =>
		expect(validateTarget({ ...base, target: '  Bob@EXAMPLE2.com ' })).toBe('forwardTargetInternal'));
	it('拒绝账号自身（域名已不在站内列表时）', () =>
		expect(validateTarget({ ...base, accountEmail: 'alice@old.com', target: 'ALICE@old.com' })).toBe('forwardTargetSelf'));
	it('第 4 个被拒', () =>
		expect(validateTarget({ ...base, existingTargets: ['a@x.com', 'b@x.com', 'c@x.com'], target: 'd@x.com' })).toBe('forwardTargetLimit'));
	it('重复不区分大小写', () =>
		expect(validateTarget({ ...base, existingTargets: ['me@gmail.com'], target: 'ME@Gmail.com' })).toBe('forwardTargetExists'));
});

describe('verify code', () => {
	it('生成 6 位数字', () => { for (let i = 0; i < 100; i++) expect(genVerifyCode()).toMatch(/^\d{6}$/); });
	it('正确码（含空格）', () => expect(matchVerifyCode('123456', ' 123456 ')).toBe(true));
	it('错误码', () => expect(matchVerifyCode('123456', '654321')).toBe(false));
	it('已清空的码永不匹配', () => {
		expect(matchVerifyCode('', '')).toBe(false);
		expect(matchVerifyCode('', undefined)).toBe(false);
	});
	it('第 4 次错只计数', () => expect(isCodeExhausted(4)).toBe(false));
	it('第 5 次错作废', () => expect(isCodeExhausted(5)).toBe(true));
});

describe('formatLastError', () => {
	it('原样保留短信息', () => expect(formatLastError('boom')).toBe('boom'));
	it('空信息', () => expect(formatLastError(undefined)).toBe(''));
	it('错误信息截断', () => expect(formatLastError('x'.repeat(600))).toHaveLength(500));
});

describe('withTimeout', () => {
	afterEach(() => vi.useRealTimers());
	it('按时完成返回结果', async () => {
		await expect(withTimeout(Promise.resolve('ok'), 15000)).resolves.toBe('ok');
	});
	it('原错误照常抛出', async () => {
		await expect(withTimeout(Promise.reject(new Error('boom')), 15000)).rejects.toThrow('boom');
	});
	it('超时报错', async () => {
		vi.useFakeTimers();
		const p = withTimeout(new Promise(() => {}), FORWARD_LIMITS.sendTimeoutMs);
		const check = expect(p).rejects.toThrow('timeout after 15000ms');
		await vi.advanceTimersByTimeAsync(15000);
		await check;
	});
	it('完成后清理定时器', async () => {
		vi.useFakeTimers();
		await withTimeout(Promise.resolve(1), 15000);
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe('pickChannel', () => {
	it('优先 Cloudflare', () => expect(pickChannel({ hasCfEmail: true, resendTokens: {}, accountEmail: 'a@example.com' })).toEqual({ type: 'cloudflare' }));
	it('按域名取 Resend', () =>
		expect(pickChannel({ hasCfEmail: false, resendTokens: { 'example.com': 're_x' }, accountEmail: 'a@Example.com' })).toEqual({ type: 'resend', token: 're_x' }));
	it('都没有', () => expect(pickChannel({ hasCfEmail: false, resendTokens: {}, accountEmail: 'a@example.com' })).toBeNull());
});

describe('canUseForward', () => {
	it('管理员不受限', () => expect(canUseForward({ isAdmin: true, permKeys: [], sendType: 'ban' })).toBe(true));
	it('有权限可用', () => expect(canUseForward({ isAdmin: false, permKeys: ['account:forward'], sendType: 'count' })).toBe(true));
	it('无权限', () => expect(canUseForward({ isAdmin: false, permKeys: [], sendType: 'count' })).toBe(false));
	it('禁止发信', () => expect(canUseForward({ isAdmin: false, permKeys: ['account:forward'], sendType: 'ban' })).toBe(false));
	it('只能站内', () => expect(canUseForward({ isAdmin: false, permKeys: ['account:forward'], sendType: 'internal' })).toBe(false));
});

describe('isForwardedMail', () => {
	it('有标记', () => expect(isForwardedMail([{ key: 'x-cloudmail-forwarded', value: '1' }])).toBe(true));
	it('无标记', () => expect(isForwardedMail([{ key: 'subject', value: 'hi' }])).toBe(false));
	it('无信头', () => expect(isForwardedMail(undefined)).toBe(false));
});

describe('display name and params', () => {
	it('清洗显示名', () => {
		expect(sanitizeDisplayName('GitHub, Inc. <noreply>')).toBe('GitHub Inc. noreply');
		expect(sanitizeDisplayName('  "Bob"\r\n ')).toBe('Bob');
		expect(sanitizeDisplayName(undefined)).toBe('');
	});
	it('无主题、无发件人时回退', () => {
		expect(buildForwardParams({
			accountEmail: 'alice@example.com', target: 'me@gmail.com', subject: '', html: '<p>hi</p>', text: 'hi',
			fromAddress: '', fromName: '', attachments: []
		})).toEqual({
			accountEmail: 'alice@example.com', name: 'alice', receiveEmail: ['me@gmail.com'], subject: '(no subject)',
			html: '<p>hi</p>', text: 'hi', attachments: [],
			headers: { 'X-CloudMail-Forwarded': '1', 'X-CloudMail-Forwarded-For': 'alice@example.com' }
		});
	});
	it('正常来信', () => {
		const p = buildForwardParams({
			accountEmail: 'alice@example.com', target: 'me@gmail.com', subject: 'Hello', html: '', text: 'hi',
			fromAddress: 'noreply@github.com', fromName: 'GitHub, Inc.', attachments: []
		});
		expect(p.name).toBe('GitHub Inc.');
		expect(p.replyTo).toBe('noreply@github.com');
		expect(p.subject).toBe('Hello');
	});
	it('无显示名时用发件人地址的本地部分，不泄露完整地址', () => {
		const p = buildForwardParams({
			accountEmail: 'alice@example.com', target: 'me@gmail.com', subject: 'Hello', html: '', text: 'hi',
			fromAddress: 'noreply@github.com', fromName: '', attachments: []
		});
		expect(p.name).toBe('noreply');
		expect(p.replyTo).toBe('noreply@github.com');
	});
	it('显示名清洗后为空时同样回退到本地部分', () => {
		const p = buildForwardParams({
			accountEmail: 'alice@example.com', target: 'me@gmail.com', subject: 'Hello', html: '', text: 'hi',
			fromAddress: 'noreply@github.com', fromName: '"<>"', attachments: []
		});
		expect(p.name).toBe('noreply');
	});
	it('没有正文时补一个空格', () => {
		const empty = { accountEmail: 'alice@example.com', target: 'me@gmail.com', subject: 'Hello',
			fromAddress: 'bob@x.com', fromName: 'Bob', attachments: [] };
		expect(buildForwardParams({ ...empty, html: '', text: '' }).text).toBe(' ');
		expect(buildForwardParams({ ...empty, html: undefined, text: undefined }).text).toBe(' ');
		expect(buildForwardParams({ ...empty, html: null, text: null }).text).toBe(' ');
	});
	it('有正文时不改动', () => {
		const base2 = { accountEmail: 'alice@example.com', target: 'me@gmail.com', subject: 'Hello',
			fromAddress: 'bob@x.com', fromName: 'Bob', attachments: [] };
		const p = buildForwardParams({ ...base2, html: '<p>hi</p>', text: '' });
		expect(p.html).toBe('<p>hi</p>');
		expect(p.text).toBe('');
		expect(buildForwardParams({ ...base2, html: '', text: 'hi' }).text).toBe('hi');
	});
});

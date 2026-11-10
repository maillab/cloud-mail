import { describe, it, expect } from 'vitest';
import {
	FORWARD_STATUS, validateTarget, genVerifyCode, checkVerifyCode, afterWrongCode,
	afterSendFailure, pickChannel, canUseForward, isForwardedMail, sanitizeDisplayName, buildForwardParams
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
	const now = Date.parse('2026-11-11T00:00:00Z');
	const row = { verifyCode: '123456', verifyExpireTime: '2026-11-11T00:30:00.000Z', verifyFailCount: 0 };
	it('生成 6 位数字', () => { for (let i = 0; i < 100; i++) expect(genVerifyCode()).toMatch(/^\d{6}$/); });
	it('正确码（含空格）', () => expect(checkVerifyCode(row, ' 123456 ', now)).toBe('ok'));
	it('错误码', () => expect(checkVerifyCode(row, '654321', now)).toBe('wrong'));
	it('过期', () => expect(checkVerifyCode(row, '123456', Date.parse('2026-11-11T00:30:00.001Z'))).toBe('invalid'));
	it('已清空', () => expect(checkVerifyCode({ ...row, verifyCode: '' }, '', now)).toBe('invalid'));
	it('已锁定', () => expect(checkVerifyCode({ ...row, verifyFailCount: 5 }, '123456', now)).toBe('invalid'));
	it('第 4 次错只计数', () => expect(afterWrongCode({ verifyFailCount: 3, verifyCode: '123456' })).toEqual({ verifyFailCount: 4, verifyCode: '123456' }));
	it('第 5 次错作废', () => expect(afterWrongCode({ verifyFailCount: 4, verifyCode: '123456' })).toEqual({ verifyFailCount: 5, verifyCode: '' }));
});

describe('afterSendFailure', () => {
	it('未到上限保持状态', () =>
		expect(afterSendFailure({ failCount: 8, status: FORWARD_STATUS.ACTIVE }, 'boom')).toEqual({ failCount: 9, status: FORWARD_STATUS.ACTIVE, lastError: 'boom' }));
	it('第 10 次自动停用', () =>
		expect(afterSendFailure({ failCount: 9, status: FORWARD_STATUS.ACTIVE }, 'boom').status).toBe(FORWARD_STATUS.FAILED));
	it('错误信息截断', () =>
		expect(afterSendFailure({ failCount: 0, status: 1 }, 'x'.repeat(600)).lastError).toHaveLength(500));
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
});

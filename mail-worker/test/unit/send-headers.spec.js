import { describe, it, expect } from 'vitest';
import { buildSendHeaders, formatFromAddress } from '../../src/lib/send-headers.js';

describe('buildSendHeaders', () => {
	it('无任何信头', () => expect(buildSendHeaders({})).toBeUndefined());
	it('回复邮件', () =>
		expect(buildSendHeaders({ sendType: 'reply', messageId: '<m@x>' })).toEqual({ 'in-reply-to': '<m@x>', references: '<m@x>' }));
	it('回复但没有 messageId', () => expect(buildSendHeaders({ sendType: 'reply' })).toBeUndefined());
	it('合并自定义信头', () =>
		expect(buildSendHeaders({ headers: { 'X-A': '1' }, sendType: 'reply', messageId: '<m@x>' }))
			.toEqual({ 'X-A': '1', 'in-reply-to': '<m@x>', references: '<m@x>' }));
});

describe('formatFromAddress', () => {
	it('普通名字', () => expect(formatFromAddress('GitHub', 'a@example.com')).toBe('"GitHub" <a@example.com>'));
	it('名字是邮箱地址', () =>
		expect(formatFromAddress('noreply@github.com', 'a@example.com')).toBe('"noreply@github.com" <a@example.com>'));
	it('去掉引号和反斜杠', () =>
		expect(formatFromAddress('Say "hi" \\ there', 'a@example.com')).toBe('"Say hi  there" <a@example.com>'));
	it('名字为空', () => {
		expect(formatFromAddress('', 'a@example.com')).toBe('a@example.com');
		expect(formatFromAddress(undefined, 'a@example.com')).toBe('a@example.com');
	});
});

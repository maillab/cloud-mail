import { describe, it, expect } from 'vitest';
import { resolveTokenUpdate, webmailUrlFor } from '../../src/stalwart/api';

const STORED = 'stal:v2:sealed';

describe('resolveTokenUpdate', () => {
	it('keeps the stored token when the field is absent', () => {
		expect(resolveTokenUpdate({}, STORED)).toEqual({ action: 'keep', token: STORED });
	});

	it('keeps the stored token when the field is blank or whitespace', () => {
		expect(resolveTokenUpdate({ token: '' }, STORED)).toEqual({ action: 'keep', token: STORED });
		expect(resolveTokenUpdate({ token: '   ' }, STORED)).toEqual({ action: 'keep', token: STORED });
		expect(resolveTokenUpdate({ token: null }, STORED)).toEqual({ action: 'keep', token: STORED });
	});

	it('replaces the token only for a non-empty value', () => {
		expect(resolveTokenUpdate({ token: '  NEW_KEY  ' }, STORED)).toEqual({
			action: 'replace', plain: 'NEW_KEY', token: STORED
		});
	});

	it('clears the token only when explicitly requested', () => {
		expect(resolveTokenUpdate({ clearToken: true }, STORED)).toEqual({ action: 'clear', token: '' });
		expect(resolveTokenUpdate({ clearToken: false, token: '' }, STORED).action).toBe('keep');
	});

	it('does not invent a token when nothing was ever stored', () => {
		expect(resolveTokenUpdate({ token: '' }, '').token).toBe('');
	});
});

describe('webmailUrlFor', () => {
	it('returns the configured https URL without any account or token state', () => {
		expect(webmailUrlFor({ env: { stalwart_webmail_url: 'https://webmail.example.test/' } }))
			.toBe('https://webmail.example.test/');
	});

	it('ignores missing, non-https and malformed values', () => {
		expect(webmailUrlFor({ env: {} })).toBe('');
		expect(webmailUrlFor({ env: { stalwart_webmail_url: 'http://webmail.example.test' } })).toBe('');
		expect(webmailUrlFor({ env: { stalwart_webmail_url: 'not a url' } })).toBe('');
	});
});

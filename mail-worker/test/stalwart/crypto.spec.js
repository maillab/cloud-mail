import { describe, it, expect } from 'vitest';
import { sealToken, openToken } from '../../src/stalwart/crypto';

describe('stalwart token encryption', () => {
	it('round-trips a token and never stores it in plaintext', async () => {
		const sealed = await sealToken('API_AAAAexample', 'jwt-secret', 'b');
		expect(sealed.startsWith('stal:v2:')).toBe(true);
		expect(sealed).not.toContain('API_AAAAexample');
		expect(await openToken(sealed, 'jwt-secret', 'b')).toBe('API_AAAAexample');
	});

	it('uses a fresh IV for every seal', async () => {
		const first = await sealToken('same-token', 'jwt-secret', 'b');
		const second = await sealToken('same-token', 'jwt-secret', 'b');
		expect(first).not.toBe(second);
	});

	it('cannot be opened with the wrong secret or account', async () => {
		const sealed = await sealToken('API_AAAAexample', 'jwt-secret', 'b');
		expect(await openToken(sealed, 'wrong-secret', 'b')).toBe('');
		expect(await openToken(sealed, 'jwt-secret', 'other')).toBe('');
	});

	it('refuses plaintext and corrupt values', async () => {
		expect(await openToken('API_AAAAexample', 'jwt-secret', 'b')).toBe('');
		expect(await openToken('stal:v2:bad', 'jwt-secret', 'b')).toBe('');
	});
});

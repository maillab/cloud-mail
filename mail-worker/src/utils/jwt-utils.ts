import type { WorkerEnv } from '../types/env';

type JwtContext = { env: Pick<WorkerEnv, 'jwt_secret'> };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const base64url = (input: ArrayBuffer | Uint8Array): string => {
	const str = btoa(String.fromCharCode(...new Uint8Array(input)));
	return str.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const base64urlDecode = (str: string): Uint8Array<ArrayBuffer> => {
	str = str.replace(/-/g, '+').replace(/_/g, '/');
	while (str.length % 4) str += '=';
	return Uint8Array.from(atob(str), c => c.charCodeAt(0));
};

function expirationOf(payload: unknown): unknown {
	// Signed JSON is not proof of a session/setup/Telegram claim shape. Retain
	// the legacy null failure and primitive results while reading only exp.
	if (payload === null) {
		throw new TypeError("Cannot read properties of null (reading 'exp')");
	}
	return typeof payload === 'object' && 'exp' in payload ? payload.exp : undefined;
}

const jwtUtils = {
	async generateToken(c: JwtContext, payload: Record<string, unknown>, expiresInSeconds?: number): Promise<string> {
		const header = {
			alg: 'HS256',
			typ: 'JWT'
		};

		const now = Math.floor(Date.now() / 1000);
		const exp = expiresInSeconds ? now + expiresInSeconds : undefined;

		const fullPayload = {
			...payload,
			iat: now,
			...(exp ? { exp } : {})
		};

		const headerStr = base64url(encoder.encode(JSON.stringify(header)));
		const payloadStr = base64url(encoder.encode(JSON.stringify(fullPayload)));
		const data = `${headerStr}.${payloadStr}`;

		const key = await crypto.subtle.importKey(
			'raw',
			encoder.encode(c.env.jwt_secret),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);

		const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
		const signatureStr = base64url(signature);

		return `${data}.${signatureStr}`;
	},

	async verifyToken(c: JwtContext, token: string | null | undefined): Promise<unknown> {
		try {
			// Hono returns undefined for an absent Authorization header. Preserve
			// the existing logged TypeError/null outcome instead of inventing a
			// new caller-side fallback or assuming that the header always exists.
			if (token === null || token === undefined) {
				throw new TypeError(`Cannot read properties of ${token} (reading 'split')`);
			}
			const [headerB64, payloadB64, signatureB64] = token.split('.');

			if (!headerB64 || !payloadB64 || !signatureB64) return null;

			const data = `${headerB64}.${payloadB64}`;
			const key = await crypto.subtle.importKey(
				'raw',
				encoder.encode(c.env.jwt_secret),
				{ name: 'HMAC', hash: 'SHA-256' },
				false,
				['verify']
			);

			const valid = await crypto.subtle.verify(
				'HMAC',
				key,
				base64urlDecode(signatureB64),
				encoder.encode(data)
			);

			if (!valid) return null;

			const payloadJson = decoder.decode(base64urlDecode(payloadB64));
			const payload: unknown = JSON.parse(payloadJson);

			const now = Math.floor(Date.now() / 1000);
			const expiration = expirationOf(payload);
			// JSON may contain a legacy string/boolean/array exp. Number retains
			// the relational comparison's numeric coercion without validating it.
			if (expiration && Number(expiration) < now) return null;

			return payload;

		} catch (err) {
			console.log(err)
			return null;
		}
	}
};

export default jwtUtils;

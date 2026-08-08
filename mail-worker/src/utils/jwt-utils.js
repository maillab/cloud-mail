const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_TOKEN_LENGTH = 8192;
const CLOCK_SKEW_SECONDS = 60;

function base64url(input) {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlDecode(value) {
	if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url');
	let normalized = value.replace(/-/g, '+').replace(/_/g, '/');
	while (normalized.length % 4) normalized += '=';
	const decoded = Uint8Array.from(atob(normalized), char => char.charCodeAt(0));
	if (base64url(decoded) !== value) throw new Error('Non-canonical base64url');
	return decoded;
}

function getSecret(c) {
	const secret = c?.env?.jwt_secret;
	if (typeof secret !== 'string' || secret.length < 32) {
		throw new Error('JWT secret is missing or too short');
	}
	return secret;
}

async function importKey(secret, usages) {
	return crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		usages
	);
}

const jwtUtils = {
	async generateToken(c, payload, expiresInSeconds) {
		if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid JWT payload');
		if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds <= 0) {
			throw new Error('JWT expiration is required');
		}

		const header = { alg: 'HS256', typ: 'JWT' };
		const now = Math.floor(Date.now() / 1000);
		const fullPayload = { ...payload, iat: now, nbf: now - 1, exp: now + expiresInSeconds };
		const headerStr = base64url(encoder.encode(JSON.stringify(header)));
		const payloadStr = base64url(encoder.encode(JSON.stringify(fullPayload)));
		const data = `${headerStr}.${payloadStr}`;
		const key = await importKey(getSecret(c), ['sign']);
		const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
		return `${data}.${base64url(signature)}`;
	},

	async verifyToken(c, token, options = {}) {
		try {
			if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
			const parts = token.split('.');
			if (parts.length !== 3) return null;
			const [headerB64, payloadB64, signatureB64] = parts;
			const header = JSON.parse(decoder.decode(base64urlDecode(headerB64)));
			if (header?.alg !== 'HS256' || header?.typ !== 'JWT') return null;

			const data = `${headerB64}.${payloadB64}`;
			const key = await importKey(getSecret(c), ['verify']);
			const valid = await crypto.subtle.verify(
				'HMAC',
				key,
				base64urlDecode(signatureB64),
				encoder.encode(data)
			);
			if (!valid) return null;

			const payload = JSON.parse(decoder.decode(base64urlDecode(payloadB64)));
			if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
			const now = Math.floor(Date.now() / 1000);
			if (!Number.isFinite(payload.exp) || payload.exp < now - CLOCK_SKEW_SECONDS) return null;
			if (Number.isFinite(payload.nbf) && payload.nbf > now + CLOCK_SKEW_SECONDS) return null;
			if (Number.isFinite(payload.iat) && payload.iat > now + CLOCK_SKEW_SECONDS) return null;
			if (options.purpose && payload.purpose !== options.purpose) return null;
			return payload;
		} catch {
			return null;
		}
	}
};

export default jwtUtils;

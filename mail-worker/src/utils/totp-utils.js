// TOTP (RFC 6238) over HMAC-SHA1, implemented on the Web Crypto API so it runs
// unchanged in a Cloudflare Worker. Compatible with Google Authenticator,
// Microsoft Authenticator, 1Password, Authy and any RFC-compliant generator.
//
// Secrets are generated here but never persisted by this module; the caller
// stores them encrypted (see security-crypto.js).

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes) {
	const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let bits = 0;
	let value = 0;
	let output = '';

	for (const byte of buffer) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}

	if (bits > 0) {
		output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
	}

	return output;
}

export function base32Decode(input) {
	const clean = String(input || '')
		.toUpperCase()
		.replace(/=+$/g, '')
		.replace(/\s+/g, '');

	let bits = 0;
	let value = 0;
	const output = [];

	for (const char of clean) {
		const index = BASE32_ALPHABET.indexOf(char);
		if (index === -1) {
			continue;
		}
		value = (value << 5) | index;
		bits += 5;
		if (bits >= 8) {
			output.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}

	return new Uint8Array(output);
}

export function generateSecret(length = 20) {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return base32Encode(bytes);
}

// A secret is valid if it decodes to at least 16 bytes; shorter secrets are
// rejected rather than silently padded, because a weak seed is a weak second
// factor.
export function isValidSecret(secret) {
	if (!secret) return false;
	const bytes = base32Decode(secret);
	return bytes.length >= 16;
}

async function hmacSha1(keyBytes, messageBytes) {
	const key = await crypto.subtle.importKey(
		'raw',
		keyBytes,
		{ name: 'HMAC', hash: 'SHA-1' },
		false,
		['sign']
	);
	return new Uint8Array(await crypto.subtle.sign('HMAC', key, messageBytes));
}

// RFC 4226 HOTP: dynamic truncation into a 6-digit code.
export async function hotp(secret, counter, digits = 6) {
	const key = base32Decode(secret);
	const message = new Uint8Array(8);
	let remaining = counter;
	for (let i = 7; i >= 0; i--) {
		message[i] = remaining & 0xff;
		remaining = Math.floor(remaining / 256);
	}

	const hash = await hmacSha1(key, message);
	const offset = hash[hash.length - 1] & 0x0f;
	const binary =
		((hash[offset] & 0x7f) << 24) |
		((hash[offset + 1] & 0xff) << 16) |
		((hash[offset + 2] & 0xff) << 8) |
		(hash[offset + 3] & 0xff);

	const code = binary % Math.pow(10, digits);
	return String(code).padStart(digits, '0');
}

export async function totp(secret, timestampMs = Date.now(), step = 30, digits = 6) {
	const counter = Math.floor(timestampMs / 1000 / step);
	return hotp(secret, counter, digits);
}

// Accept the adjacent steps only. A wider window turns a 6-digit code into a
// reusable credential, so this is deliberately ±1 (about 90 seconds of drift).
export async function verifyTotp(secret, token, options = {}) {
	const { window = 1, step = 30, timestampMs = Date.now(), digits = 6 } = options;
	const clean = String(token || '').replace(/\D/g, '');
	if (clean.length !== digits) {
		return false;
	}

	const counter = Math.floor(timestampMs / 1000 / step);

	for (let offset = -window; offset <= window; offset++) {
		const candidate = counter + offset;
		if (candidate < 0) continue;
		if (await hotp(secret, candidate, digits) === clean) {
			return true;
		}
	}

	return false;
}

// The otpauth:// URI that authenticator apps scan. Issuer and account name are
// shown in the app's list, so the member can tell work accounts apart.
export function buildOtpAuthUri(secret, accountName, issuer = 'XPass HQ') {
	const label = encodeURIComponent(`${issuer}:${accountName}`);
	const params = new URLSearchParams({
		secret,
		issuer,
		algorithm: 'SHA1',
		digits: '6',
		period: '30'
	});
	return `otpauth://totp/${label}?${params.toString()}`;
}

// Groups a base32 secret into readable 4-character blocks for manual entry.
export function formatSecretForManualEntry(secret) {
	return String(secret || '').match(/.{1,4}/g)?.join(' ') || '';
}
export default { generateSecret, isValidSecret, base32Encode, base32Decode, hotp, totp, verifyTotp, buildOtpAuthUri, formatSecretForManualEntry };

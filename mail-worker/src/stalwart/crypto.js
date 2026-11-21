// Stalwart API token encryption.
// The token is a narrow per-account API key. It is never stored in plaintext.
// Key material is derived from the existing JWT secret with HKDF-SHA256;
// AES-256-GCM provides integrity as well as confidentiality.

const PREFIX = 'stal:v2:';
const SALT = 'cloud-mail/stalwart-token/v1';
const INFO = 'stalwart-api-token';

function toBase64(bytes) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function fromBase64(value) {
	const binary = atob(String(value || ''));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function deriveKey(secret, accountId) {
	const ikm = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(String(secret || '')),
		'HKDF',
		false,
		['deriveKey']
	);
	return crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: new TextEncoder().encode(SALT),
			info: new TextEncoder().encode(`${INFO}:${String(accountId || '')}`)
		},
		ikm,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

// Idempotent: an already sealed value is returned unchanged.
export async function sealToken(plain, secret, accountId) {
	const value = String(plain || '').trim();
	if (!value || value.startsWith(PREFIX)) return value;
	const key = await deriveKey(secret, accountId);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		new TextEncoder().encode(value)
	);
	return `${PREFIX}${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

// Returns '' for anything that is not a valid sealed token.
export async function openToken(value, secret, accountId) {
	const stored = String(value || '');
	if (!stored.startsWith(PREFIX)) return '';
	try {
		const body = stored.slice(PREFIX.length);
		const split = body.indexOf('.');
		if (split < 0) return '';
		const iv = fromBase64(body.slice(0, split));
		const data = fromBase64(body.slice(split + 1));
		const key = await deriveKey(secret, accountId);
		const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
		return new TextDecoder().decode(plain);
	} catch {
		return '';
	}
}

export function secretKeyFromEnv(env) {
	return String(env?.stalwart_secret || env?.jwt_secret || '');
}

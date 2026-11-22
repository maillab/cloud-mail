// Symmetric encryption for stored credentials (authenticator seeds, provider
// secrets). The key is derived from the deployment's jwt_secret, so it is not
// committed to the repository and is not the same value as the token secret
// itself: a leaked database cannot be used to generate valid TOTP codes.
//
// AES-GCM is used because it authenticates the ciphertext. A tampered or
// truncated value fails to decrypt instead of yielding a plausible seed.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let cachedKey = null;
let cachedKeySource = null;

async function deriveKey(secret) {
	const material = await crypto.subtle.importKey(
		'raw',
		encoder.encode(String(secret)),
		'PBKDF2',
		false,
		['deriveKey']
	);

	return crypto.subtle.deriveKey(
		{
			name: 'PBKDF2',
			salt: encoder.encode('xpass-hq-secret-v1'),
			iterations: 100000,
			hash: 'SHA-256'
		},
		material,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

async function getKey(secret) {
	if (!cachedKey || cachedKeySource !== secret) {
		cachedKey = await deriveKey(secret);
		cachedKeySource = secret;
	}
	return cachedKey;
}

function toBase64(bytes) {
	return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function fromBase64(value) {
	const raw = atob(value);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) {
		bytes[i] = raw.charCodeAt(i);
	}
	return bytes;
}

// Returns a self-describing string: v1.<iv>.<ciphertext>, all base64url.
export async function encryptSecret(plaintext, secret) {
	if (plaintext === null || plaintext === undefined || plaintext === '') {
		return null;
	}
	const key = await getKey(secret);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		encoder.encode(String(plaintext))
	);
	return ['v1', toBase64(iv), toBase64(encrypted)].join('.');
}

export async function decryptSecret(payload, secret) {
	if (!payload) {
		return null;
	}
	const parts = String(payload).split('.');
	if (parts.length !== 3 || parts[0] !== 'v1') {
		throw new Error('Unsupported secret payload format');
	}
	const key = await getKey(secret);
	const decrypted = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: fromBase64(parts[1]) },
		key,
		fromBase64(parts[2])
	);
	return decoder.decode(decrypted);
}

// One-way hash used for recovery codes and invitation tokens. These are looked
// up by value at redemption time, so a plain SHA-256 is the right primitive:
// the inputs are already high-entropy random strings, not user passwords.
export async function hashToken(value) {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
	return toBase64(digest);
}

export async function generateRecoveryCodes(count = 10) {
	const codes = [];
	for (let i = 0; i < count; i++) {
		const bytes = crypto.getRandomValues(new Uint8Array(10));
		// Crockford-ish alphabet without ambiguous characters.
		const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
		let code = '';
		for (const byte of bytes) {
			code += alphabet[byte % alphabet.length];
		}
		codes.push(code.match(/.{1,5}/g).join('-'));
	}
	return codes;
}

export async function generateInvitationToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// A temporary password for administrator-created accounts. Long enough to be
// safe as a one-time credential; the member replaces it on first sign-in.
export async function generateTemporaryPassword(length = 16) {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	let out = '';
	for (const byte of bytes) {
		out += alphabet[byte % alphabet.length];
	}
	return out;
}

// Constant-time comparison to avoid leaking how much of a code matched.
export function safeEqual(a, b) {
	const left = String(a || '');
	const right = String(b || '');
	if (left.length !== right.length) {
		return false;
	}
	let diff = 0;
	for (let i = 0; i < left.length; i++) {
		diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
	}
	return diff === 0;
}
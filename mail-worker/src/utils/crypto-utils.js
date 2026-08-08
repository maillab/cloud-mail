const encoder = new TextEncoder();

const PASSWORD_SCHEME = 'pbkdf2-sha256';
const DEFAULT_PBKDF2_ITERATIONS = 20_000;
const MIN_PBKDF2_ITERATIONS = 10_000;
const MAX_PBKDF2_ITERATIONS = 2_000_000;
const KEY_LENGTH_BITS = 256;

function bytesToBase64(bytes) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function base64ToBytes(value) {
	try {
		return Uint8Array.from(atob(value), char => char.charCodeAt(0));
	} catch {
		return null;
	}
}

function timingSafeEqual(left, right) {
	if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array) || left.length !== right.length) {
		return false;
	}
	let diff = 0;
	for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
	return diff === 0;
}

async function legacyHash(password, salt) {
	const data = encoder.encode(`${salt}${password}`);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return bytesToBase64(new Uint8Array(digest));
}

const saltHashUtils = {
	generateSalt(length = 16) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return bytesToBase64(array);
	},

	iterationsFromEnv(env = {}) {
		const raw = Number(env?.password_pbkdf2_iterations);
		if (!Number.isSafeInteger(raw)) return DEFAULT_PBKDF2_ITERATIONS;
		return Math.max(MIN_PBKDF2_ITERATIONS, Math.min(raw, MAX_PBKDF2_ITERATIONS));
	},

	async hashPassword(password, iterations = DEFAULT_PBKDF2_ITERATIONS) {
		const safeIterations = Math.max(MIN_PBKDF2_ITERATIONS, Math.min(Number(iterations) || DEFAULT_PBKDF2_ITERATIONS, MAX_PBKDF2_ITERATIONS));
		const salt = this.generateSalt(24);
		const hash = await this.genHashPassword(password, salt, safeIterations);
		return { salt, hash };
	},

	async genHashPassword(password, salt, iterations = DEFAULT_PBKDF2_ITERATIONS) {
		const material = await crypto.subtle.importKey(
			'raw',
			encoder.encode(password),
			{ name: 'PBKDF2' },
			false,
			['deriveBits']
		);
		const bits = await crypto.subtle.deriveBits(
			{
				name: 'PBKDF2',
				hash: 'SHA-256',
				salt: encoder.encode(salt),
				iterations
			},
			material,
			KEY_LENGTH_BITS
		);
		return `${PASSWORD_SCHEME}$${iterations}$${bytesToBase64(new Uint8Array(bits))}`;
	},

	async verifyPassword(inputPassword, salt, storedHash) {
		if (typeof inputPassword !== 'string' || typeof salt !== 'string' || typeof storedHash !== 'string') {
			return false;
		}

		if (storedHash.startsWith(`${PASSWORD_SCHEME}$`)) {
			const parts = storedHash.split('$');
			const iterations = Number(parts[1]);
			const expected = base64ToBytes(parts[2] || '');
			if (!Number.isSafeInteger(iterations) || iterations < MIN_PBKDF2_ITERATIONS || iterations > MAX_PBKDF2_ITERATIONS || !expected) {
				return false;
			}
			const actualHash = await this.genHashPassword(inputPassword, salt, iterations);
			const actual = base64ToBytes(actualHash.split('$')[2]);
			return timingSafeEqual(actual, expected);
		}

		const actualLegacyHash = await legacyHash(inputPassword, salt);
		const actual = base64ToBytes(actualLegacyHash);
		const expected = base64ToBytes(storedHash);
		return timingSafeEqual(actual, expected);
	},

	needsRehash(storedHash, targetIterations = DEFAULT_PBKDF2_ITERATIONS) {
		if (typeof storedHash !== 'string' || !storedHash.startsWith(`${PASSWORD_SCHEME}$`)) return true;
		const iterations = Number(storedHash.split('$')[1]);
		const target = Math.max(MIN_PBKDF2_ITERATIONS, Math.min(Number(targetIterations) || DEFAULT_PBKDF2_ITERATIONS, MAX_PBKDF2_ITERATIONS));
		return !Number.isSafeInteger(iterations) || iterations < target;
	},

	genRandomPwd(length = 16) {
		const safeLength = Math.max(12, Math.min(Number(length) || 16, 128));
		const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_';
		const maxUnbiased = Math.floor(256 / chars.length) * chars.length;
		let result = '';
		while (result.length < safeLength) {
			const random = new Uint8Array(Math.max(16, safeLength - result.length));
			crypto.getRandomValues(random);
			for (const value of random) {
				if (value >= maxUnbiased) continue;
				result += chars[value % chars.length];
				if (result.length === safeLength) break;
			}
		}
		return result;
	}
};

export default saltHashUtils;

const encoder = new TextEncoder();

// Workers 的 PBKDF2 迭代次数上限为 100000
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_PREFIX = 'pbkdf2$';

const toBase64 = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));

// 常量时间比较, 防止时序攻击
const safeEqual = (a, b) => {
	if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
		return false;
	}
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
};

const saltHashUtils = {

	generateSalt(length = 16) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return btoa(String.fromCharCode(...array));
	},


	async hashPassword(password) {
		const salt = this.generateSalt();
		const hash = await this.genHashPassword(password, salt);
		return { salt, hash };
	},

	// 存储格式: pbkdf2$迭代次数$base64哈希
	async genHashPassword(password, salt, iterations = PBKDF2_ITERATIONS) {
		const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
		const bits = await crypto.subtle.deriveBits(
			{ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations },
			key,
			256
		);
		return `${PBKDF2_PREFIX}${iterations}$${toBase64(bits)}`;
	},

	// 旧版: 单次 SHA-256, 仅用于校验已有密码
	async genLegacyHashPassword(password, salt) {
		const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(salt + password));
		return toBase64(hashBuffer);
	},

	async verifyPassword(inputPassword, salt, storedHash) {
		if (typeof inputPassword !== 'string' || !storedHash) {
			return false;
		}

		if (storedHash.startsWith(PBKDF2_PREFIX)) {
			const iterations = Number(storedHash.split('$')[1]);
			if (!Number.isInteger(iterations) || iterations <= 0 || iterations > PBKDF2_ITERATIONS) {
				return false;
			}
			const hash = await this.genHashPassword(inputPassword, salt, iterations);
			return safeEqual(hash, storedHash);
		}

		const hash = await this.genLegacyHashPassword(inputPassword, salt);
		return safeEqual(hash, storedHash);
	},

	needsRehash(storedHash) {
		return !storedHash?.startsWith(`${PBKDF2_PREFIX}${PBKDF2_ITERATIONS}$`);
	},

	genRandomPwd(length = 16) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const values = new Uint32Array(length);
		crypto.getRandomValues(values);
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(values[i] % chars.length);
		}
		return result;
	}
};

export default saltHashUtils;

const encoder = new TextEncoder();

// PBKDF2 参数：HMAC-SHA-256，10 万轮（Workers CPU 与安全性的折中）
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_PREFIX = 'pbkdf2';

const saltHashUtils = {

	generateSalt(length = 16) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return btoa(String.fromCharCode(...array));
	},

	// 新哈希一律用 PBKDF2，格式：pbkdf2$<轮数>$<base64>
	async hashPassword(password) {
		const salt = this.generateSalt();
		const hash = await this.pbkdf2(password, salt, PBKDF2_ITERATIONS);
		return { salt, hash: `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${hash}` };
	},

	async pbkdf2(password, saltB64, iterations) {
		const keyMaterial = await crypto.subtle.importKey(
			'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
		);
		const saltBytes = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
		const bits = await crypto.subtle.deriveBits(
			{ name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
			keyMaterial, 256
		);
		return btoa(String.fromCharCode(...new Uint8Array(bits)));
	},

	// 老格式：SHA-256(salt + password) 单轮（base64 44 字符，无版本前缀），仅用于兼容校验
	async genHashPassword(password, salt) {
		const data = encoder.encode(salt + password);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return btoa(String.fromCharCode(...hashArray));
	},

	// 是否需要升级到 PBKDF2（登录成功后透明升级）
	needsRehash(storedHash) {
		return typeof storedHash !== 'string' || !storedHash.startsWith(PBKDF2_PREFIX + '$');
	},

	async verifyPassword(inputPassword, salt, storedHash) {
		if (typeof storedHash === 'string' && storedHash.startsWith(PBKDF2_PREFIX + '$')) {
			const parts = storedHash.split('$');
			const iterations = parseInt(parts[1], 10);
			if (!Number.isFinite(iterations) || iterations <= 0) return false;
			const computed = await this.pbkdf2(inputPassword, salt, iterations);
			return this.safeEqual(computed, parts[2] || '');
		}
		const hash = await this.genHashPassword(inputPassword, salt);
		return this.safeEqual(hash, storedHash);
	},

	// 恒定时间比较，防时序侧信道
	safeEqual(a, b) {
		if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
		let diff = 0;
		for (let i = 0; i < a.length; i++) {
			diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
		}
		return diff === 0;
	},

	genRandomPwd(length = 8) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(array[i] % chars.length);
		}
		return result;
	}
};

export default saltHashUtils;

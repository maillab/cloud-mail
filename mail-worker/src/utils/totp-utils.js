const TOTP_STEP = 30;
const TOTP_DIGITS = 6;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const totpUtils = {

	// ---- base32（RFC 4648，无填充） ----
	base32Encode(bytes) {
		let bits = 0, value = 0, output = '';
		for (const b of bytes) {
			value = (value << 8) | b;
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
	},

	base32Decode(str) {
		const clean = String(str).replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
		let bits = 0, value = 0;
		const bytes = [];
		for (const ch of clean) {
			value = (value << 5) | BASE32_ALPHABET.indexOf(ch);
			bits += 5;
			if (bits >= 8) {
				bytes.push((value >>> (bits - 8)) & 255);
				bits -= 8;
			}
		}
		return new Uint8Array(bytes);
	},

	generateSecret(byteLength = 20) {
		const bytes = new Uint8Array(byteLength);
		crypto.getRandomValues(bytes);
		return this.base32Encode(bytes);
	},

	// ---- HOTP / TOTP（RFC 4226 / 6238） ----
	async hotp(secretB32, counter) {
		const keyBytes = this.base32Decode(secretB32);
		const key = await crypto.subtle.importKey(
			'raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
		);
		const msg = new ArrayBuffer(8);
		const view = new DataView(msg);
		view.setUint32(0, Math.floor(counter / 0x100000000));
		view.setUint32(4, counter >>> 0);
		const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
		const offset = sig[sig.length - 1] & 0x0f;
		const code = ((sig[offset] & 0x7f) << 24)
			| ((sig[offset + 1] & 0xff) << 16)
			| ((sig[offset + 2] & 0xff) << 8)
			| (sig[offset + 3] & 0xff);
		return String(code % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, '0');
	},

	async totp(secretB32, atMs = Date.now()) {
		return this.hotp(secretB32, Math.floor(atMs / 1000 / TOTP_STEP));
	},

	// 容忍前后各 window 个步长（默认 ±1，应对时钟漂移）
	async verify(secretB32, code, window = 1, atMs = Date.now()) {
		const normalized = String(code || '').replace(/\D/g, '');
		if (normalized.length !== TOTP_DIGITS) return false;
		const counter = Math.floor(atMs / 1000 / TOTP_STEP);
		for (let i = -window; i <= window; i++) {
			if (await this.hotp(secretB32, counter + i) === normalized) return true;
		}
		return false;
	},

	buildUri(secretB32, account, issuer) {
		const label = encodeURIComponent(`${issuer}:${account}`);
		return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&digits=${TOTP_DIGITS}&period=${TOTP_STEP}`;
	},

	// ---- secret 的 AES-GCM 加密存储（密钥派生自 jwt_secret） ----
	async getAesKey(jwtSecret) {
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(jwtSecret)));
		return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
	},

	b64encode(bytes) {
		return btoa(String.fromCharCode(...bytes));
	},

	b64decode(b64) {
		return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
	},

	async encryptSecret(jwtSecret, plaintext) {
		const key = await this.getAesKey(jwtSecret);
		const iv = new Uint8Array(12);
		crypto.getRandomValues(iv);
		const ct = new Uint8Array(await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)
		));
		return this.b64encode(iv) + '.' + this.b64encode(ct);
	},

	async decryptSecret(jwtSecret, payload) {
		const [ivB64, ctB64] = String(payload).split('.');
		const key = await this.getAesKey(jwtSecret);
		const pt = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: this.b64decode(ivB64) }, key, this.b64decode(ctB64)
		);
		return new TextDecoder().decode(pt);
	},

	// ---- 恢复码：10 个 XXXX-XXXX，返回 [{code, hash}]，只存 hash ----
	async genRecoveryCodes(count = 10) {
		const codes = [];
		const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字符
		for (let i = 0; i < count; i++) {
			const bytes = new Uint8Array(8);
			crypto.getRandomValues(bytes);
			let raw = '';
			for (const b of bytes) raw += chars[b % chars.length];
			const code = raw.slice(0, 4) + '-' + raw.slice(4);
			const hash = await this.sha256hex(code.replace('-', '').toLowerCase());
			codes.push({ code, hash });
		}
		return codes;
	},

	async sha256hex(str) {
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
		return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
	},

	async hashRecoveryCode(code) {
		return this.sha256hex(String(code).replace(/[^a-zA-Z0-9]/g, '').toLowerCase());
	}
};

export default totpUtils;

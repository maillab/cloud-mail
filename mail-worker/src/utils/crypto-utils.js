const encoder = new TextEncoder();

const saltHashUtils = {

	generateSalt(length = 16) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return btoa(String.fromCharCode(...array));
	},

	async hashPassword(password) {
		const salt = this.generateSalt();
		const hash = await this.genPbkdf2Hash(password, salt);
		return { salt, hash };
	},

	// New: PBKDF2 with 100k iterations
	async genPbkdf2Hash(password, saltB64) {
		const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
		const keyMaterial = await crypto.subtle.importKey(
			'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
		);
		const hash = await crypto.subtle.deriveBits(
			{ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
			keyMaterial, 256
		);
		return 'pbkdf2:' + btoa(String.fromCharCode(...new Uint8Array(hash)));
	},

	// Legacy: single SHA-256 (for verifying old passwords)
	async genLegacyHash(password, salt) {
		const data = encoder.encode(salt + password);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return btoa(String.fromCharCode(...hashArray));
	},

	async verifyPassword(inputPassword, salt, storedHash) {
		if (storedHash.startsWith('pbkdf2:')) {
			const hash = await this.genPbkdf2Hash(inputPassword, salt);
			return hash === storedHash;
		}
		// Legacy SHA-256 verification
		const hash = await this.genLegacyHash(inputPassword, salt);
		return hash === storedHash;
	},

	// Check if hash needs upgrade to PBKDF2
	needsUpgrade(storedHash) {
		return !storedHash.startsWith('pbkdf2:');
	},

	genRandomPwd(length = 8) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return result;
	}
};

export default saltHashUtils;

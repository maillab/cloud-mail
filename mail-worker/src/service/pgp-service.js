import * as openpgp from 'openpgp';
import BizError from '../error/biz-error';
import KvConst from '../const/kv-const';
import verifyUtils from '../utils/verify-utils';
import { t } from '../i18n/i18n.js';

const KEY_TTL = 60 * 60;
const NEG_TTL = 60 * 60;

const ZBASE32_ALPHABET = 'ybndrfg8ejkmcpqxot1uwisza345h769';

function zbase32Encode(bytes) {
	let result = '';
	let buffer = 0;
	let bits = 0;
	for (const byte of bytes) {
		buffer = (buffer << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			bits -= 5;
			result += ZBASE32_ALPHABET[(buffer >> bits) & 31];
		}
	}
	if (bits > 0) {
		result += ZBASE32_ALPHABET[(buffer << (5 - bits)) & 31];
	}
	return result;
}

async function wkdHash(email) {
	const local = email.split('@')[0].toLowerCase();
	const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(local));
	return zbase32Encode(new Uint8Array(digest));
}

async function keyUsableFor(key, email) {
	const lower = email.toLowerCase();
	const ids = key.getUserIDs();
	if (!ids.some(id => id.toLowerCase().includes(lower))) {
		return false;
	}
	try {
		await key.getEncryptionKey();
		return true;
	} catch (e) {
		return false;
	}
}

async function fetchWkdKey(email) {
	const domain = email.split('@')[1];
	let hu;
	try {
		hu = await wkdHash(email);
	} catch (e) {
		return null;
	}
	const urls = [
		`https://${domain}/.well-known/openpgpkey/hu/${hu}`,
		`https://openpgpkey.${domain}/.well-known/openpgpkey/${domain}/hu/${hu}`
	];
	for (const url of urls) {
		try {
			const res = await fetch(url, { headers: { 'Accept': 'application/octet-stream' } });
			if (!res.ok) {
				continue;
			}
			const buf = new Uint8Array(await res.arrayBuffer());
			if (buf.length === 0) {
				continue;
			}
			const key = await openpgp.readKey({ binaryKey: buf });
			if (await keyUsableFor(key, email)) {
				return key;
			}
		} catch (e) {
			continue;
		}
	}
	return null;
}

async function fetchKeyserverKey(email) {
	try {
		const res = await fetch(`https://keys.openpgp.org/vks/v1/by-email/${encodeURIComponent(email)}`);
		if (!res.ok) {
			return null;
		}
		const armored = await res.text();
		if (!armored || !armored.includes('PGP PUBLIC KEY')) {
			return null;
		}
		const key = await openpgp.readKey({ armoredKey: armored });
		if (await keyUsableFor(key, email)) {
			return key;
		}
	} catch (e) {
		// ignore, fall through
	}
	return null;
}

const pgpService = {

	cacheKey(email) {
		return KvConst.PGP_KEY + email.toLowerCase();
	},

	async discoverKey(c, email) {

		if (!verifyUtils.isEmail(email)) {
			return null;
		}

		const key = this.cacheKey(email);
		const cached = await c.env.kv.get(key, { type: 'json' });

		if (cached) {
			return cached.found ? cached : null;
		}

		let found = null;

		const wkdKey = await fetchWkdKey(email);
		const keyserverKey = wkdKey ? null : await fetchKeyserverKey(email);
		const pgpKey = wkdKey || keyserverKey;

		if (pgpKey) {
			found = {
				found: true,
				email: email.toLowerCase(),
				armored: pgpKey.armor(),
				fingerprint: pgpKey.getFingerprint()
			};
			await c.env.kv.put(key, JSON.stringify(found), { expirationTtl: KEY_TTL });
		} else {
			await c.env.kv.put(key, JSON.stringify({ found: false }), { expirationTtl: NEG_TTL });
		}

		return found;
	},

	async keyStatus(c, email) {
		if (!verifyUtils.isEmail(email)) {
			throw new BizError(t('notEmail'));
		}
		const found = await this.discoverKey(c, email);
		return {
			email,
			found: !!found,
			fingerprint: found ? found.fingerprint : null
		};
	},

	/**
	 * 上传公钥并刷新缓存（App 生成钥匙后调用，避免等 7 天缓存过期）
	 * 从钥匙的 User ID 里提取邮箱，只缓存钥匙里声明的邮箱，防止投毒
	 */
	async uploadKey(c, armored) {
		if (!armored || !armored.includes('PGP PUBLIC KEY')) {
			throw new BizError(t('pgpInvalidKey'));
		}
		let key;
		try {
			key = await openpgp.readKey({ armoredKey: armored.trim() });
		} catch (e) {
			throw new BizError(t('pgpInvalidKey'));
		}
		// 必须有加密子钥匙，否则传了也发不了密文
		try {
			await key.getEncryptionKey();
		} catch (e) {
			throw new BizError(t('pgpKeyNotUsable'));
		}
		const userIds = key.getUserIDs();
		const emails = [...new Set(
			userIds.map(uid => {
				const m = uid.match(/<([^>]+)>/);
				return m ? m[1].toLowerCase().trim() : null;
			}).filter(e => e && verifyUtils.isEmail(e))
		)];
		if (emails.length === 0) {
			throw new BizError(t('pgpInvalidKey'));
		}
		const fingerprint = key.getFingerprint();
		const cached = {
			found: true,
			armored: armored.trim(),
			fingerprint
		};
		const updated = [];
		for (const email of emails) {
			const cacheKey = this.cacheKey(email);
			cached.email = email;
			await c.env.kv.put(cacheKey, JSON.stringify(cached), { expirationTtl: KEY_TTL });
			updated.push(email);
		}
		return { updated, fingerprint };
	},

	async readKeys(armoredKeys) {
		return await Promise.all(armoredKeys.map(armored => openpgp.readKey({ armoredKey: armored })));
	},

	async encryptText(text, armoredKeys) {
		const keys = await this.readKeys(armoredKeys);
		const message = await openpgp.createMessage({ text });
		return await openpgp.encrypt({ message, encryptionKeys: keys, format: 'armored' });
	},

	async encryptBinary(data, filename, armoredKeys) {
		const keys = await this.readKeys(armoredKeys);
		const message = await openpgp.createMessage({ binary: data, filename });
		return await openpgp.encrypt({ message, encryptionKeys: keys, format: 'armored' });
	},

	async encryptOutgoing(c, recipients, text, attachments) {

		const armoredKeys = [];
		const missing = [];

		for (const email of recipients) {
			const found = await this.discoverKey(c, email);
			if (found) {
				armoredKeys.push(found.armored);
			} else {
				missing.push(email);
			}
		}

		if (missing.length > 0) {
			throw new BizError(t('pgpKeyNotFound', { msg: missing.join(', ') }));
		}

		const encryptedText = await this.encryptText(text, armoredKeys);

		const encryptedAttachments = [];

		for (const attachment of attachments) {
			const content = await this.toUint8Array(attachment.content);
			if (!content) {
				continue;
			}
			const armored = await this.encryptBinary(content, attachment.filename || 'attachment', armoredKeys);
			encryptedAttachments.push({
				content: new TextEncoder().encode(armored),
				filename: (attachment.filename || 'attachment') + '.pgp',
				mimeType: attachment.mimeType || attachment.contentType || 'application/octet-stream'
			});
		}

		return { text: encryptedText, attachments: encryptedAttachments };
	},

	htmlToText(html) {
		return (html || '')
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
			.replace(/<[^>]+>/g, '')
			.replace(/&nbsp;/g, ' ')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&')
			.replace(/\n{3,}/g, '\n\n')
			.trim();
	},

	async toUint8Array(content) {		if (!content) {
			return null;
		}
		if (content instanceof Uint8Array) {
			return content;
		}
		if (content instanceof ArrayBuffer) {
			return new Uint8Array(content);
		}
		if (typeof content === 'string') {
			let str = content;
			if (str.startsWith('data:')) {
				str = str.split(',')[1] || str;
			}
			const bin = atob(str.replace(/\s+/g, ''));
			const bytes = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i++) {
				bytes[i] = bin.charCodeAt(i);
			}
			return bytes;
		}
		return null;
	}

};

export default pgpService;

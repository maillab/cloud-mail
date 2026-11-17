// Web Push 协议实现（Workers 没有 Node crypto，用不了 web-push 库，这里用 WebCrypto 直接实现）。
// - VAPID（RFC 8292）：用服务端 P-256 私钥签 ES256 JWT，向推送服务证明身份。
// - 消息加密（RFC 8291 + RFC 8188 aes128gcm）：只有订阅方浏览器能解密，推送服务看不到内容。
// iOS / macOS Safari（web.push.apple.com）、Chrome（FCM）、Firefox 都走这套标准协议。

const encoder = new TextEncoder();

// 单条记录大小。负载必须放进一条记录：密文 = 明文 + 1 字节分隔符 + 16 字节认证标签。
const RECORD_SIZE = 4096;
const HEADER_SIZE = 16 + 4 + 1 + 65;
export const MAX_PAYLOAD_BYTES = RECORD_SIZE - HEADER_SIZE - 1 - 16;

export function b64urlEncode(input) {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	let str = '';
	for (const byte of bytes) {
		str += String.fromCharCode(byte);
	}
	return btoa(str).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function b64urlDecode(str) {
	str = str.replace(/-/g, '+').replace(/_/g, '/');
	while (str.length % 4) str += '=';
	return Uint8Array.from(atob(str), ch => ch.charCodeAt(0));
}

function concat(...parts) {
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

async function hkdf(salt, ikm, info, length) {
	const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
	return new Uint8Array(bits);
}

// 生成 VAPID 密钥对。公钥是未压缩点（65 字节）的 base64url，前端 subscribe 时作为 applicationServerKey；
// 私钥以 JWK JSON 保存，只在服务端使用。
export async function generateVapidKeys() {
	const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
	const publicKey = b64urlEncode(await crypto.subtle.exportKey('raw', pair.publicKey));
	const { kty, crv, x, y, d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
	return { publicKey, privateKey: JSON.stringify({ kty, crv, x, y, d }) };
}

// 订阅密钥格式校验：p256dh 是未压缩 P-256 公钥（65 字节，0x04 开头），auth 是 16 字节随机数。
export function isValidSubscriptionKeys(p256dh, auth) {
	try {
		const publicKey = b64urlDecode(p256dh);
		return publicKey.length === 65 && publicKey[0] === 4 && b64urlDecode(auth).length === 16;
	} catch {
		return false;
	}
}

// 生成 Authorization 头。aud 必须是推送服务的 origin；exp 不能超过 24 小时；
// sub 必须是 mailto: 或 https: 地址（Apple 对格式校验很严格，不合法会返回 403 BadJwtToken）。
export async function vapidAuthorization(endpoint, vapid, subject) {
	const header = b64urlEncode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
	const claims = b64urlEncode(encoder.encode(JSON.stringify({
		aud: new URL(endpoint).origin,
		exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
		sub: subject
	})));
	const key = await crypto.subtle.importKey('jwk', JSON.parse(vapid.privateKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
	// WebCrypto 的 ECDSA 签名输出就是 r||s（64 字节），正好是 JWS 要求的格式。
	const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${claims}`));
	return `vapid t=${header}.${claims}.${b64urlEncode(signature)}, k=${vapid.publicKey}`;
}

// 按 RFC 8291 加密负载，返回完整的 aes128gcm 请求体：salt(16) | rs(4) | idlen(1) | 临时公钥(65) | 密文。
export async function encryptPayload(payload, p256dh, auth) {
	const plain = typeof payload === 'string' ? encoder.encode(payload) : payload;
	if (plain.length > MAX_PAYLOAD_BYTES) {
		throw new Error(`Push payload too large: ${plain.length} bytes`);
	}

	const uaPublic = b64urlDecode(p256dh);
	const authSecret = b64urlDecode(auth);

	// 每条消息用一对新的临时密钥与浏览器公钥做 ECDH。
	const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
	const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
	const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
	const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

	const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic);
	const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

	const salt = crypto.getRandomValues(new Uint8Array(16));
	const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
	const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

	// 0x02 表示这是最后一条记录，后面不加填充。
	const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
	const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(plain, new Uint8Array([2]))));

	const header = new Uint8Array(HEADER_SIZE);
	header.set(salt, 0);
	new DataView(header.buffer).setUint32(16, RECORD_SIZE);
	header[20] = asPublic.length;
	header.set(asPublic, 21);

	return concat(header, cipher);
}

// 向一个订阅发送推送，返回推送服务的 Response。
// 201 表示已接收；404 / 410 表示订阅已失效，调用方应删除该订阅。
export async function sendWebPush(subscription, payload, vapid, subject, options = {}) {
	const body = await encryptPayload(payload, subscription.p256dh, subscription.auth);
	return fetch(subscription.endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/octet-stream',
			'Content-Encoding': 'aes128gcm',
			'TTL': String(options.ttl ?? 24 * 60 * 60),
			'Urgency': options.urgency || 'high',
			'Authorization': await vapidAuthorization(subscription.endpoint, vapid, subject)
		},
		body
	});
}

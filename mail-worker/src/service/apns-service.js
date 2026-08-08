// APNs 推送——用 Token 认证(.p8 密钥 + ES256 JWT),不是证书认证,配置简单一些。
//
// 需要在 Cloudflare Workers 后台配置这些环境变量/密钥:
//   apns_key_id       Apple Developer 后台生成的 Key ID(10 位)
//   apns_team_id      Apple 开发者账号的 Team ID(10 位)
//   apns_private_key  .p8 文件的完整内容,包含 -----BEGIN PRIVATE KEY----- 那几行,
//                      建议用 `wrangler secret put apns_private_key` 设置,不要明文
//                      写进 wrangler.toml
//   apns_bundle_id    iOS App 的 Bundle Identifier,要跟 Xcode 项目里的一致
//   apns_environment  'production' 或 'sandbox'。Xcode 真机调试装的 App 走
//                      sandbox,TestFlight/App Store 分发的走 production——
//                      环境不对,推送会失败(BadDeviceToken)

let cachedToken = null;
let cachedTokenExpireAt = 0;

function base64url(bytes) {
	let binary = '';
	bytes.forEach(b => binary += String.fromCharCode(b));
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importSigningKey(pem) {
	const base64 = pem
		.replace('-----BEGIN PRIVATE KEY-----', '')
		.replace('-----END PRIVATE KEY-----', '')
		.replace(/\s/g, '');
	const der = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
	return crypto.subtle.importKey(
		'pkcs8',
		der,
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign']
	);
}

async function getAuthToken(c) {
	const now = Math.floor(Date.now() / 1000);

	// Apple 建议同一个 JWT 复用、不要每次推送都重新签,这里缓存 50 分钟
	// (官方说的上限是 1 小时,留点余量)。Workers 实例可能被回收,这个内存缓存
	// 不保证一直命中,但命中的时候能省一次签名运算,不命中就重新签一个,不影响正确性。
	if (cachedToken && now < cachedTokenExpireAt) {
		return cachedToken;
	}

	const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', kid: c.env.apns_key_id })));
	const payload = base64url(new TextEncoder().encode(JSON.stringify({ iss: c.env.apns_team_id, iat: now })));
	const signingInput = `${header}.${payload}`;

	const key = await importSigningKey(c.env.apns_private_key);

	// 关键点:Web Crypto 的 ECDSA 签名结果就是 JWS ES256 要的 raw R||S 拼接格式
	// (P-256 曲线下一共 64 字节,r/s 各 32),不是 ASN.1 DER 编码,不需要再转换。
	// 很多从 Node.js 移植过来的示例代码会在这里因为格式不对而验证失败,这里不用担心。
	const signature = await crypto.subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' },
		key,
		new TextEncoder().encode(signingInput)
	);

	const token = `${signingInput}.${base64url(new Uint8Array(signature))}`;
	cachedToken = token;
	cachedTokenExpireAt = now + 50 * 60;
	return token;
}

const apnsService = {

	/**
	 * 给一批 device token 推送"有新邮件"通知,单个设备失败不影响其它设备。
	 */
	async pushNewMail(c, tokens, emailRow) {
		if (!c.env.apns_key_id || !c.env.apns_team_id || !c.env.apns_private_key || !c.env.apns_bundle_id) {
			return; // 没配置 APNs 就静默跳过,不影响正常收发信
		}
		if (!tokens || tokens.length === 0) {
			return;
		}

		const host = c.env.apns_environment === 'sandbox'
			? 'https://api.sandbox.push.apple.com'
			: 'https://api.push.apple.com';

		const authToken = await getAuthToken(c);

		const payload = JSON.stringify({
			aps: {
				alert: {
					title: String(emailRow.name || emailRow.sendEmail || '新邮件').slice(0, 120),
					body: String(emailRow.subject || '(无主题)').slice(0, 500)
				},
				sound: 'default'
			},
			emailId: emailRow.emailId
		});

		const deviceTokenService = (await import('./device-token-service')).default;

		const validTokens = [...new Set(tokens.map(item => String(item || '').toLowerCase()).filter(item => /^[0-9a-f]{32,256}$/.test(item) && item.length % 2 === 0))].slice(0, 10);
		await Promise.all(validTokens.map(async (token) => {
			try {
				const res = await fetch(`${host}/3/device/${token}`, {
					method: 'POST',
					headers: {
						'authorization': `bearer ${authToken}`,
						'apns-topic': c.env.apns_bundle_id,
						'apns-push-type': 'alert',
						'apns-priority': '10',
						'content-type': 'application/json'
					},
					body: payload
				});

				if (!res.ok) {
					const text = await res.text();
					let reason = '';
					try { reason = JSON.parse(text)?.reason || ''; } catch { reason = text.slice(0, 200); }
					console.error(`APNs 推送失败 status:${res.status} reason:${reason}`);
					if (['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'].includes(reason)) {
						await deviceTokenService.removeToken(c, token);
					}
				}
			} catch (e) {
				console.error('APNs 推送异常:', e.message);
			}
		}));
	}

};

export default apnsService;
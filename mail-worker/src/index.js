import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import r2Service from './service/r2-service';
import oauthService from './service/oauth-service';
import analysisService from './service/analysis-service';
export default {
	 async fetch(req, env, ctx) {

		const url = new URL(req.url)

		// Android 通行密钥：Digital Asset Links 关联文件。
		// Bitwarden / Google 密码管理工具凭此确认 me.huanjue.cloudmail 有权使用该域名的 passkey，
		// 否则会报"此 App 不支持通行密钥"。
		// 签名指纹从环境变量 ASSETLINKS_FINGERPRINTS 读取（逗号分隔，可同时配 debug + release 签名）；
		// 该文件必须挂在 passkey 的 RP ID 域名下（即 App 里填的服务器地址的 host）。
		if (url.pathname === '/.well-known/assetlinks.json') {
			const raw = (env.ASSETLINKS_FINGERPRINTS || '').trim();
			const fingerprints = raw.split(',')
				.map(fp => {
					const hex = fp.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
					return (hex.match(/../g) || []).join(':');
				})
				.filter(fp => fp.length === 95); // 32 字节 → 带冒号 95 字符
			if (fingerprints.length === 0) {
				return new Response(JSON.stringify({ message: 'assetlinks not configured' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
				});
			}
			return new Response(JSON.stringify([{
				relation: ['delegate_permission/common.get_login_creds'],
				target: {
					namespace: 'android_app',
					package_name: 'me.huanjue.cloudmail',
					sha256_cert_fingerprints: fingerprints
				}
			}], null, 2), {
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' }
			});
		}

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		if (url.pathname.startsWith('/oss/')) {
			const key = url.pathname.slice('/oss/'.length);
			const resp = await r2Service.toObjResp({ env }, key);
			return resp || new Response('Not Found', { status: 404 });
		}

		 if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) {
			 const resp = await r2Service.toObjResp({ env }, url.pathname.substring(1));
			 return resp || new Response('Not Found', { status: 404 });
		 }

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		if (c.cron === '*/30 * * * *') {
			await analysisService.refreshEchartsCache({ env })
			return;
		}

		await verifyRecordService.clearRecord({ env })
		await userService.resetDaySendCount({ env })
		await emailService.completeReceiveAll({ env })
		await emailService.autoClean({ env })
		await analysisService.refreshEchartsCache({ env })
		await oauthService.clearNoBindOathUser({ env })
	},
};

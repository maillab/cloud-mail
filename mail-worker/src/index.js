import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import kvObjService from './service/kv-obj-service';
import oauthService from "./service/oauth-service";
import r2Service from './service/r2-service';
export default {
	 async fetch(req, env, ctx) {

		const url = new URL(req.url)

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		 if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) {
			 const key = url.pathname.substring(1);
			 const c = { env };
			 const storageType = await r2Service.storageType(c);

			 if (storageType === 'R2') {
				 const obj = await env.r2.get(key);
				 if (!obj) return new Response('Not Found', { status: 404 });
				 return new Response(obj.body, {
					 headers: {
						 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
						 'Content-Disposition': obj.httpMetadata?.contentDisposition || '',
						 'Cache-Control': obj.httpMetadata?.cacheControl || 'public, max-age=86400'
					 }
				 });
			 }

			 return await kvObjService.toObjResp(c, key);
		 }

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		await verifyRecordService.clearRecord({ env })
		await userService.resetDaySendCount({ env })
		await emailService.completeReceiveAll({ env })
		await emailService.cleanupDeletedEmails({ env })
		await oauthService.clearNoBindOathUser({ env })
	},
};

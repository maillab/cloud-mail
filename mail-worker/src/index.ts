import app from './hono/webs';
import type { WorkerEnv } from './types/env';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import kvObjService from './service/kv-obj-service';
import oauthService from './service/oauth-service';
import analysisService from './service/analysis-service';
export default {
	 async fetch(req: Request, env: WorkerEnv, ctx: ExecutionContext) {

		const url = new URL(req.url)

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		 if (['/static/','/attachments/','/mail/attachments/'].some(p => url.pathname.startsWith(p))) {
			 const key = url.pathname.replace(/^\/mail\/attachments\//, '/attachments/').substring(1);
			 return await kvObjService.toObjResp({ env }, key, req);
		 }

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c: ScheduledController, env: WorkerEnv, _ctx: ExecutionContext) {
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
} satisfies ExportedHandler<WorkerEnv>;

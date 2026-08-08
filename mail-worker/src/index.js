import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import r2Service from './service/r2-service';
import oauthService from './service/oauth-service';
import analysisService from './service/analysis-service';

async function runScheduledTasks(tasks) {
	const results = await Promise.allSettled(tasks.map(task => task()));
	for (const result of results) {
		if (result.status === 'rejected') console.error('定时任务执行失败', result.reason?.stack || result.reason?.message || result.reason);
	}
}

export default {
	async fetch(req, env, ctx) {
		const url = new URL(req.url);
		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '');
			req = new Request(url.toString(), req);
			return app.fetch(req, env, ctx);
		}
		if (['/static/', '/attachments/'].some(prefix => url.pathname.startsWith(prefix))) {
			return r2Service.response({ env }, url.pathname.substring(1));
		}
		return env.assets.fetch(req);
	},

	email,

	async scheduled(controller, env, ctx) {
		if (controller.cron === '*/30 * * * *') {
			ctx.waitUntil(runScheduledTasks([() => analysisService.refreshEchartsCache({ env })]));
			return;
		}
		ctx.waitUntil(runScheduledTasks([
			() => verifyRecordService.clearRecord({ env }),
			() => userService.resetDaySendCount({ env }),
			() => emailService.completeReceiveAll({ env }),
			() => oauthService.clearNoBindOathUser({ env }),
			() => analysisService.refreshEchartsCache({ env })
		]));
	}
};

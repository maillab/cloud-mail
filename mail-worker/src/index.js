import app from './hono/webs';
import { handleMcpRequest } from './mcp/handler';
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

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		// MCP endpoint (Streamable HTTP, stateless). Must stay BEFORE the
		// static-assets fallback below, otherwise /mcp/ would serve the SPA.
		// Only POST (MCP calls) and OPTIONS (CORS preflight) are intercepted:
		// a plain GET /mcp must still fall through to the SPA so the Vue
		// landing page (route /mcp) loads on refresh and direct links.
		// Auth: Bearer MCP_AUTH_KEY (Worker secret; unset = all calls rejected).
		// Write tools only when MCP_WRITE_ENABLED === 'true'. See src/mcp/README.md.
		if ((url.pathname === '/mcp' || url.pathname === '/mcp/') &&
			(req.method === 'POST' || req.method === 'OPTIONS')) {
			return handleMcpRequest(req, env);
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

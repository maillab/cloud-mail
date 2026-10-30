import resendService from '../service/resend-service';
import settingService from '../service/setting-service';
import { Webhook } from 'svix';
import app from '../hono/hono';
app.post('/webhooks',async (c) => {
	try {
		const settingData = await settingService.query(c);
		const secret = settingData.resendWebhookSecret;
		if (secret) {
			// 验证 Resend Webhook 签名，防止伪造请求
			const svixHeaders = {
				'svix-id': c.req.header('svix-id'),
				'svix-timestamp': c.req.header('svix-timestamp'),
				'svix-signature': c.req.header('svix-signature'),
			};
			const rawBody = await c.req.text();
			const wh = new Webhook(secret);
			wh.verify(rawBody, svixHeaders);
			await resendService.webhooks(c, JSON.parse(rawBody));
		} else {
			// 未配置签名密钥时保持原有行为（向后兼容）
			await resendService.webhooks(c, await c.req.json());
		}
		return c.text('success', 200)
	} catch (e) {
		return c.text(e.message, 500)
	}
})

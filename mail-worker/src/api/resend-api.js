import resendService from '../service/resend-service';
import app from '../hono/hono';
app.post('/webhooks',async (c) => {
	try {
		const rawBody = await c.req.text();
		if (!await resendService.verifyWebhook(c, rawBody)) {
			return c.text('invalid signature', 401)
		}
		await resendService.webhooks(c, JSON.parse(rawBody));
		return c.text('success', 200)
	} catch (e) {
		return  c.text(e.message, 500)
	}
})

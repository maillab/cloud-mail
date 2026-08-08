import resendService from '../service/resend-service';
import app from '../hono/hono';
import { verifySvixWebhook } from '../utils/webhook-utils';
import { parseBooleanEnv } from '../utils/input-utils';

app.post('/webhooks', async (c) => {
	const payload = await c.req.text();
	const secret = c.env.resend_webhook_secret;
	const allowUnsigned = parseBooleanEnv(c.env.allow_unsigned_resend_webhook, false);

	if (!secret && !allowUnsigned) return c.text('Webhook secret is not configured', 503);
	if (secret) {
		const valid = await verifySvixWebhook({
			secret,
			payload,
			id: c.req.header('svix-id'),
			timestamp: c.req.header('svix-timestamp'),
			signature: c.req.header('svix-signature')
		});
		if (!valid) return c.text('Invalid webhook signature', 401);
	}

	let body;
	try {
		body = JSON.parse(payload);
	} catch {
		return c.text('Invalid JSON', 400);
	}

	const webhookId = c.req.header('svix-id');
	const replayKey = webhookId ? `webhook:resend:${webhookId}` : '';
	if (replayKey && await c.env.kv.get(replayKey)) return c.text('success', 200);

	try {
		await resendService.webhooks(c, body);
		if (replayKey) await c.env.kv.put(replayKey, '1', { expirationTtl: 24 * 60 * 60 });
		return c.text('success', 200);
	} catch (error) {
		console.error(`[${c.get('requestId') || 'webhook'}] resend webhook`, error);
		return c.text('Internal error', 500);
	}
});

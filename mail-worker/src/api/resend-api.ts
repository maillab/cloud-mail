import type { Hono } from 'hono';
import type { AppEnvironment } from '../types/context';
import { errorMessage } from '../error/error-message';
import resendService from '../service/resend-service';

export function registerResendApi(app: Hono<AppEnvironment>) {
	app.post('/webhooks',async (c) => {
		try {
			await resendService.webhooks(c, await c.req.json<Parameters<typeof resendService.webhooks>[1]>());
			return c.text('success', 200)
		} catch (e) {
			// Hono/Response previously converted an absent message to an empty body.
			return c.text(errorMessage(e) ?? '', 500)
		}
	})
}

import type { Hono } from 'hono';
import type { AppEnvironment } from '../types/context';
import telegramService from '../service/telegram-service';

export function registerTelegramApi(app: Hono<AppEnvironment>) {
	app.get('/telegram/getEmail/:token', async (c) => {
		const content = await telegramService.getEmailContent(c, { token: c.req.param('token') });
		c.header('Cache-Control', 'public, max-age=604800, immutable');
		return c.html(content)
	});
}

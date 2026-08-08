import app from '../hono/hono';
import telegramService from '../service/telegram-service';

app.get('/telegram/getEmail/:token', async (c) => {
	const content = await telegramService.getEmailContent(c, c.req.param());
	c.header('Cache-Control', 'private, max-age=300');
	c.header('Referrer-Policy', 'no-referrer');
	c.header('X-Frame-Options', 'SAMEORIGIN');
	c.header('Content-Security-Policy', "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
	return c.html(content)
});


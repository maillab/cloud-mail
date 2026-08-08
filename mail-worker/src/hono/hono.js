import { Hono } from 'hono';
import result from '../model/result';

const app = new Hono();
const ALLOW_HEADERS = 'Authorization, Content-Type, Accept-Language, X-Init-Secret, Svix-Id, Svix-Timestamp, Svix-Signature';
const ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';

function allowedOrigins(c) {
	return String(c.env?.cors_origins || '')
		.split(',')
		.map(item => item.trim())
		.filter(Boolean);
}

function resolveCorsOrigin(c) {
	const origin = c.req.header('Origin');
	if (!origin) return null;
	const requestOrigin = new URL(c.req.url).origin;
	if (origin === requestOrigin) return origin;
	const configured = allowedOrigins(c);
	if (configured.includes('*') || configured.includes(origin)) return origin;
	return null;
}

app.use('*', async (c, next) => {
	const requestId = c.req.header('CF-Ray') || crypto.randomUUID();
	c.set('requestId', requestId);
	c.header('X-Request-Id', requestId);
	c.header('X-Content-Type-Options', 'nosniff');
	c.header('Referrer-Policy', 'no-referrer');
	c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	c.header('Cache-Control', 'no-store');

	const contentLength = Number(c.req.header('Content-Length') || 0);
	if (Number.isFinite(contentLength) && contentLength > 40 * 1024 * 1024) return c.json(result.fail('请求体不能超过40MB', 413), 413);

	const origin = resolveCorsOrigin(c);
	if (origin) {
		c.header('Access-Control-Allow-Origin', origin);
		c.header('Vary', 'Origin');
		c.header('Access-Control-Allow-Headers', ALLOW_HEADERS);
		c.header('Access-Control-Allow-Methods', ALLOW_METHODS);
		c.header('Access-Control-Max-Age', '86400');
	}

	if (c.req.method === 'OPTIONS') {
		if (c.req.header('Origin') && !origin) return c.body(null, 403);
		return c.body(null, 204);
	}
	await next();
});

app.onError((err, c) => {
	const requestId = c.get('requestId') || 'unknown';
	if (err?.name === 'BizError') {
		console.warn(`[${requestId}] ${err.message}`);
		return c.json(result.fail(err.message, err.code));
	}

	console.error(`[${requestId}]`, err);
	if (err instanceof SyntaxError) return c.json(result.fail('请求JSON格式错误', 400), 400);
	const message = String(err?.message || '');
	if (message.includes("reading 'get'") || message.includes("reading 'put'")) {
		return c.json(result.fail('KV数据库未绑定 KV database not bound', 502));
	}
	if (message.includes("reading 'prepare'")) {
		return c.json(result.fail('D1数据库未绑定 D1 database not bound', 502));
	}
	return c.json(result.fail(`服务器内部错误 Internal server error (${requestId})`, 500), 500);
});

export default app;

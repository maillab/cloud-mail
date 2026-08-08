import app from '../hono/hono';
import { dbInit } from '../init/init';

app.get('/health', (c) => {
	const checks = {
		d1: Boolean(c.env?.db && typeof c.env.db.prepare === 'function'),
		kv: Boolean(c.env?.kv && typeof c.env.kv.get === 'function' && typeof c.env.kv.put === 'function'),
		jwtSecret: typeof c.env?.jwt_secret === 'string' && c.env.jwt_secret.length >= 32,
		initSecret: typeof c.env?.init_secret === 'string' && c.env.init_secret.length >= 32
	};
	return c.json({
		status: 'ok',
		service: 'cloud-mail',
		ready: Object.values(checks).every(Boolean),
		checks
	});
});

app.post('/init', async (c) => {
	return dbInit.init(c, c.req.header('X-Init-Secret'));
});

app.get('/init/:secret', async (c) => {
	return dbInit.init(c, c.req.param('secret'), true);
});

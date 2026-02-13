import { Hono } from 'hono';
const app = new Hono();

import result from '../model/result';
import { cors } from 'hono/cors';

const normalizeOrigin = (origin) => {
	if (!origin) {
		return '';
	}
	return origin.trim().replace(/\/+$/, '');
};

const parseCorsOrigins = (env) => {
	const rawOrigins = env?.cors_origins ?? env?.cors_origin ?? env?.cors_origins_json ?? env?.cors_origins_list;
	if (!rawOrigins) {
		return [];
	}

	if (Array.isArray(rawOrigins)) {
		return rawOrigins.map(normalizeOrigin).filter(Boolean);
	}

	if (typeof rawOrigins === 'string') {
		const trimmed = rawOrigins.trim();
		if (!trimmed) {
			return [];
		}
		if (trimmed.startsWith('[')) {
			try {
				const parsed = JSON.parse(trimmed);
				if (Array.isArray(parsed)) {
					return parsed.map(normalizeOrigin).filter(Boolean);
				}
			} catch (error) {
				console.warn('Invalid cors_origins JSON, falling back to comma list', error);
			}
		}
		return trimmed
			.split(',')
			.map((item) => normalizeOrigin(item))
			.filter(Boolean);
	}

	return [];
};

app.use(
	'*',
	cors({
		origin: (origin, c) => {
			const allowList = parseCorsOrigins(c.env);
			const normalized = normalizeOrigin(origin);
			if (!normalized || allowList.length === 0) {
				return undefined;
			}
			return allowList.includes(normalized) ? normalized : undefined;
		},
		credentials: false,
		allowHeaders: ['Authorization', 'Content-Type'],
		exposeHeaders: ['Content-Disposition']
	})
);

app.onError((err, c) => {
	if (err.name === 'BizError') {
		console.log(err.message);
	} else {
		console.error(err);
	}

	if (err.message === `Cannot read properties of undefined (reading 'get')`) {
		return c.json(result.fail('KV数据库未绑定 KV database not bound',502));
	}

	if (err.message === `Cannot read properties of undefined (reading 'put')`) {
		return c.json(result.fail('KV数据库未绑定 KV database not bound',502));
	}

	if (err.message === `Cannot read properties of undefined (reading 'prepare')`) {
		return c.json(result.fail('D1数据库未绑定 D1 database not bound',502));
	}

	return c.json(result.fail(err.message, err.code));
});

export default app;


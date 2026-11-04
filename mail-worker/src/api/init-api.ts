import type { Hono } from 'hono';
import type { AppEnvironment } from '../types/context';
import { dbInit } from '../init/init';

export function registerInitApi(app: Hono<AppEnvironment>) {
	app.get('/init/:secret', (c) => {
		return dbInit.init(c);
	})
}

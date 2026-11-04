import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnvironment } from '../types/context';
import { handleError } from '../error/hono-error-handler';

export function createHono() {
	const app = new Hono<AppEnvironment>();
	app.use('*', cors());
	app.onError(handleError);
	return app;
}

import type { Hono } from 'hono';
import type { AppEnvironment } from '../types/context';
import { requiredRow } from '../lib/required-row';
import r2Service from '../service/r2-service';

export function registerR2Api(app: Hono<AppEnvironment>) {
	app.get('/oss/*', async (c) => {
		const key = c.req.path.split('/oss/')[1];
		const obj = requiredRow(await r2Service.getObj(c, key), 'body');
		const metadata = 'httpMetadata' in obj ? obj.httpMetadata : undefined;
		return new Response(obj.body, {
			headers: {
				'Content-Type': metadata?.contentType || 'application/octet-stream',
				'Content-Disposition': String(metadata?.contentDisposition || null)
			}
		});
	});
}

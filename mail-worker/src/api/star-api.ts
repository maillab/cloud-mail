import type { Hono } from 'hono';
import type { AppEnvironment } from '../types/context';
import starService from '../service/star-service';
import userContext from '../security/user-context';
import result from '../model/result';

export function registerStarApi(app: Hono<AppEnvironment>) {
	app.post('/star/add', async (c) => {
		await starService.add(c, await c.req.json<Parameters<typeof starService.add>[1]>(), userContext.getUserId(c));
		return c.json(result.ok());
	});

	app.get('/star/list', async (c) => {
		const data = await starService.list(c, c.req.query(), userContext.getUserId(c));
		return c.json(result.ok(data));
	});

	app.delete('/star/cancel', async (c) => {
		const params = await c.req.query();
		await starService.cancel(c, { emailId: params.emailId }, userContext.getUserId(c));
		return c.json(result.ok());
	});
}

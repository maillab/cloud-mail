import type { Hono } from 'hono';
import type { AppEnvironment } from '../types/context';
import result from '../model/result';
import publicService from '../service/public-service';

export function registerPublicApi(app: Hono<AppEnvironment>) {
	app.post('/public/genToken', async (c) => {
		const data = await publicService.genToken(c, await c.req.json<Parameters<typeof publicService.genToken>[1]>());
		return c.json(result.ok(data));
	});

	app.post('/public/emailList', async (c) => {
		const list = await publicService.emailList(c, await c.req.json<Parameters<typeof publicService.emailList>[1]>());
		return c.json(result.ok(list));
	});

	app.post('/public/addUser', async (c) => {
		await publicService.addUser(c, await c.req.json<Parameters<typeof publicService.addUser>[1]>());
		return c.json(result.ok());
	});
}

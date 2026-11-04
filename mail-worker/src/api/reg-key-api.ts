import type { Hono } from 'hono';
import type { AppEnvironment } from '../types/context';
import result from '../model/result';
import regKeyService from '../service/reg-key-service';
import userContext from '../security/user-context';
import type { RegKeyInput } from '../types/admin';

export function registerRegKeyApi(app: Hono<AppEnvironment>) {
	app.post('/regKey/add', async (c) => {
		await regKeyService.add(c, await c.req.json<RegKeyInput>(), await userContext.getUserId(c));
		return c.json(result.ok());
	})

	app.get('/regKey/list', async (c) => {
		const list = await regKeyService.list(c, c.req.query());
		 return c.json(result.ok(list));
	})

	app.delete('/regKey/delete', async (c) => {
		const params = c.req.query();
		await regKeyService.delete(c, { regKeyIds: params.regKeyIds });
		return c.json(result.ok());
	})

	app.delete('/regKey/clearNotUse', async (c) => {
		await regKeyService.clearNotUse(c);
		return c.json(result.ok());
	})

	app.get('/regKey/history', async (c) => {
		const params = c.req.query();
		const list = await regKeyService.history(c, { regKeyId: params.regKeyId });
		return c.json(result.ok(list));
	})
}

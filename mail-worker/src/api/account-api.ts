import type { Hono } from 'hono';
import type { AppEnvironment } from '../types/context';
import accountService from '../service/account-service';
import result from '../model/result';
import userContext from '../security/user-context';

export function registerAccountApi(app: Hono<AppEnvironment>) {
	app.get('/account/list', async (c) => {
		const list = await accountService.list(c, c.req.query(), userContext.getUserId(c));
		return c.json(result.ok(list));
	});

	app.delete('/account/delete', async (c) => {
		await accountService.delete(c, { accountId: c.req.query().accountId }, userContext.getUserId(c));
		return c.json(result.ok());
	});

	app.post('/account/add', async (c) => {
		const account = await accountService.add(c, await c.req.json<Parameters<typeof accountService.add>[1]>(), userContext.getUserId(c));
		return c.json(result.ok(account));
	});

	app.put('/account/setName', async (c) => {
		await accountService.setName(c, await c.req.json<Parameters<typeof accountService.setName>[1]>(), userContext.getUserId(c));
		return c.json(result.ok());
	});

	app.put('/account/setAllReceive', async (c) => {
		await accountService.setAllReceive(c, await c.req.json<Parameters<typeof accountService.setAllReceive>[1]>(), userContext.getUserId(c));
		return c.json(result.ok());
	});

	app.put('/account/setAsTop', async (c) => {
		await accountService.setAsTop(c, await c.req.json<Parameters<typeof accountService.setAsTop>[1]>(), userContext.getUserId(c));
		return c.json(result.ok());
	});
}

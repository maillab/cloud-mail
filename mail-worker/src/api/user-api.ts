import type { Hono } from 'hono';
import type { AppEnvironment } from '../types/context';
import userService from '../service/user-service';
import result from '../model/result';
import userContext from '../security/user-context';
import accountService from '../service/account-service';

export function registerUserApi(app: Hono<AppEnvironment>) {
	app.delete('/user/delete', async (c) => {
		await userService.physicsDelete(c, { userIds: c.req.query().userIds });
		return c.json(result.ok());
	});

	app.put('/user/setPwd', async (c) => {
		await userService.setPwd(c, await c.req.json<Parameters<typeof userService.setPwd>[1]>());
		return c.json(result.ok());
	});

	app.put('/user/setStatus', async (c) => {
		await userService.setStatus(c, await c.req.json<Parameters<typeof userService.setStatus>[1]>());
		return c.json(result.ok());
	});

	app.put('/user/setType', async (c) => {
		await userService.setType(c, await c.req.json<Parameters<typeof userService.setType>[1]>());
		return c.json(result.ok());
	});

	app.get('/user/list', async (c) => {
		const data = await userService.list(c, c.req.query(), userContext.getUserId(c));
		return c.json(result.ok(data));
	});

	app.post('/user/add', async (c) => {
		await userService.add(c, await c.req.json<Parameters<typeof userService.add>[1]>());
		return c.json(result.ok());
	});

	app.put('/user/resetSendCount', async (c) => {
		await userService.resetSendCount(c, await c.req.json<Parameters<typeof userService.resetSendCount>[1]>());
		return c.json(result.ok());
	});

	app.put('/user/restore', async (c) => {
		await userService.restore(c, await c.req.json<Parameters<typeof userService.restore>[1]>());
		return c.json(result.ok());
	});

	app.get('/user/allAccount', async (c) => {
		const data = await accountService.allAccount(c, { ...c.req.query(), userId: c.req.query().userId });
		return c.json(result.ok(data));
	});

	app.delete('/user/deleteAccount', async (c) => {
		await accountService.physicsDelete(c, { accountId: c.req.query().accountId });
		return c.json(result.ok());
	});
}

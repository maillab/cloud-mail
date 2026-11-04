import type { Hono } from 'hono';
import type { AppEnvironment } from '../types/context';
import emailService from '../service/email-service';
import { listPersonalMail, latestPersonalMail } from '../service/mail-query-service';
import result from '../model/result';
import userContext from '../security/user-context';
import attService from '../service/att-service';

export function registerEmailApi(app: Hono<AppEnvironment>) {
	app.get('/email/list', async (c) => {
		const data = await listPersonalMail(c, c.req.query(), userContext.getUserId(c));
		return c.json(result.ok(data));
	});

	app.get('/email/latest', async (c) => {
		const list = await latestPersonalMail(c, c.req.query(), userContext.getUserId(c));
		return c.json(result.ok(list));
	});

	app.delete('/email/delete', async (c) => {
		await emailService.delete(c, { emailIds: c.req.query().emailIds }, userContext.getUserId(c));
		return c.json(result.ok());
	});

	app.get('/email/attList', async (c) => {
		const attList = await attService.list(c, { emailId: c.req.query().emailId }, userContext.getUserId(c));
		return c.json(result.ok(attList));
	});

	app.post('/email/send', async (c) => {
		const email = await emailService.send(c, await c.req.json<Parameters<typeof emailService.send>[1]>(), userContext.getUserId(c));
		return c.json(result.ok(email));
	});

	app.put('/email/read', async (c) => {
		await emailService.read(c, await c.req.json<Parameters<typeof emailService.read>[1]>(), userContext.getUserId(c));
		return c.json(result.ok());
	})
}

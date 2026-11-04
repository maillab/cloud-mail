import type { Hono } from 'hono';
import type { AppEnvironment } from '../types/context';
import emailService from '../service/email-service';
import { listAllMail, latestAllMail } from '../service/all-mail-query-service';
import result from '../model/result';

export function registerAllEmailApi(app: Hono<AppEnvironment>) {
	app.get('/allEmail/list', async (c) => {
		const data = await listAllMail(c, c.req.query());
		return c.json(result.ok(data));
	})

	app.delete('/allEmail/delete', async (c) => {
		const list = await emailService.physicsDelete(c, { emailIds: c.req.query().emailIds });
		return c.json(result.ok(list));
	})

	app.delete('/allEmail/batchDelete', async (c) => {
		await emailService.batchDelete(c, c.req.query());
		return c.json(result.ok());
	})

	app.get('/allEmail/latest', async (c) => {
		const list = await latestAllMail(c, c.req.query());
		return c.json(result.ok(list));
	})
}

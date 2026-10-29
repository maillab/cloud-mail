import app from '../hono/hono';
import emailService from '../service/email-service';
import accountService from '../service/account-service';
import result from '../model/result';

app.get('/allEmail/list', async (c) => {
	const data = await emailService.allList(c, c.req.query());
	return c.json(result.ok(data));
})

app.delete('/allEmail/delete', async (c) => {
	const list = await emailService.physicsDelete(c, c.req.query());
	return c.json(result.ok(list));
})

app.delete('/allEmail/batchDelete', async (c) => {
	await emailService.batchDelete(c, c.req.query());
	return c.json(result.ok());
})

app.get('/allEmail/latest', async (c) => {
	const list = await emailService.allEmailLatest(c, c.req.query());
	return c.json(result.ok(list));
})

app.get('/allEmail/accountList', async (c) => {
	const data = await accountService.searchAllAccounts(c, c.req.query());
	return c.json(result.ok(data));
})

import app from '../hono/hono';
import emailService from '../service/email-service';
import result from '../model/result';
import mailClaimService from '../service/mail-claim-service';

app.get('/allEmail/claimAccounts', async (c) => {
	return c.json(result.ok(await mailClaimService.accounts(c, c.req.query())));
});

app.post('/allEmail/claim', async (c) => {
	return c.json(result.ok(await mailClaimService.claim(c, await c.req.json())));
});

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

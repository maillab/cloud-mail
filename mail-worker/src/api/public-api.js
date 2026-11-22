import app from '../hono/hono';
import result from '../model/result';
import publicService from '../service/public-service';
import * as finance from '../service/finance-service';

app.post('/public/genToken', async (c) => {
	const data = await publicService.genToken(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/public/emailList', async (c) => {
	const list = await publicService.emailList(c, await c.req.json());
	return c.json(result.ok(list));
});

app.post('/public/addUser', async (c) => {
	await publicService.addUser(c, await c.req.json());
	return c.json(result.ok());
});

// Read-only invoice shared by a hashed token. Unauthenticated by design: the
// token is the credential. Returns only the narrow public invoice projection.
app.get('/public/invoice/:token', async (c) => {
	const invoice = await finance.getSharedInvoice(c, c.req.param('token'));
	if (!invoice) return c.json(result.fail('This invoice link is not available.', 404));
	return c.json(result.ok(invoice));
});

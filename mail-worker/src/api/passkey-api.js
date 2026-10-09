import app from '../hono/hono';
import passkeyService from '../service/passkey-service';
import result from '../model/result';
import userContext from '../security/user-context';

app.post('/passkey/register/options', async (c) => {
	const options = await passkeyService.registerOptions(c, userContext.getUserId(c));
	return c.json(result.ok(options));
});

app.post('/passkey/register/verify', async (c) => {
	const data = await passkeyService.registerVerify(c, userContext.getUserId(c), await c.req.json());
	return c.json(result.ok(data));
});

app.post('/passkey/login/options', async (c) => {
	const data = await passkeyService.loginOptions(c);
	return c.json(result.ok(data));
});

app.post('/passkey/login/verify', async (c) => {
	const token = await passkeyService.loginVerify(c, await c.req.json());
	return c.json(result.ok({ token: token }));
});

app.get('/passkey/list', async (c) => {
	const list = await passkeyService.list(c, userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.delete('/passkey/:passkeyId', async (c) => {
	await passkeyService.remove(c, userContext.getUserId(c), c.req.param('passkeyId'));
	return c.json(result.ok());
});

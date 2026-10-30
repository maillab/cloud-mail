import app from '../hono/hono';
import result from "../model/result";
import totpService from "../service/totp-service";
import userContext from '../security/user-context';

app.post('/totp/enroll', async (c) => {
	const data = await totpService.enroll(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/totp/confirm', async (c) => {
	const data = await totpService.confirm(c, userContext.getUserId(c), (await c.req.json()).code);
	return c.json(result.ok(data));
});

app.post('/totp/disable', async (c) => {
	await totpService.disable(c, userContext.getUserId(c));
	return c.json(result.ok());
});

app.get('/totp/status', async (c) => {
	const data = await totpService.status(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/totp/recovery-codes', async (c) => {
	const data = await totpService.regenerateRecoveryCodes(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

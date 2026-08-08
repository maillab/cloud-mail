import app from '../hono/hono';
import deviceTokenService from '../service/device-token-service';
import userContext from '../security/user-context';
import result from '../model/result';

app.post('/device/register', async (c) => {
	const { token } = await c.req.json();
	await deviceTokenService.register(c, userContext.getUserId(c), token);
	return c.json(result.ok());
});

app.delete('/device/unregister', async (c) => {
	await deviceTokenService.unregisterAllByUserId(c, userContext.getUserId(c));
	return c.json(result.ok());
});
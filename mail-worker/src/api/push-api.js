import app from '../hono/hono';
import result from '../model/result';
import pushService from '../service/push-service';
import userContext from '../security/user-context';

app.get('/push/publicKey', async (c) => {
	const data = await pushService.publicKey(c);
	return c.json(result.ok(data));
});

app.post('/push/subscribe', async (c) => {
	const data = await pushService.subscribe(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/push/unsubscribe', async (c) => {
	await pushService.unsubscribe(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

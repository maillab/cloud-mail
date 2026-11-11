import app from '../hono/hono';
import forwardService from '../service/forward-service';
import result from '../model/result';
import userContext from '../security/user-context';

const getLang = (c) => c.req.header('accept-language')?.split('-')[0] === 'en' ? 'en' : 'zh';

app.get('/forward/list', async (c) => {
	const list = await forwardService.list(c, userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.post('/forward/add', async (c) => {
	const { targetEmail } = await c.req.json();
	const row = await forwardService.add(c, { targetEmail }, userContext.getUserId(c), getLang(c));
	return c.json(result.ok(row));
});

app.post('/forward/verify', async (c) => {
	await forwardService.verify(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.post('/forward/resendCode', async (c) => {
	await forwardService.resendCode(c, await c.req.json(), userContext.getUserId(c), getLang(c));
	return c.json(result.ok());
});

app.put('/forward/setStatus', async (c) => {
	await forwardService.setStatus(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.delete('/forward/delete', async (c) => {
	await forwardService.remove(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});

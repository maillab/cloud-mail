import app from '../hono/hono';
import result from '../model/result';
import publicService from '../service/public-service';

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

// 服务器能力探测（供客户端判断 fork 独有功能，主仓库无此接口返回 404）
app.get('/public/capabilities', (c) => {
	return c.json(result.ok({
		passkey: true,
		totp: true,
		pgp: true
	}));
});

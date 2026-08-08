import app from '../hono/hono';
import result from '../model/result';
import oauthService from '../service/oauth-service';

app.get('/oauth/linuxDo/state', async (c) => {
	return c.json(result.ok(await oauthService.createState(c)));
});

app.post('/oauth/linuxDo/login', async (c) => {
	return c.json(result.ok(await oauthService.linuxDoLogin(c, await c.req.json())));
});

app.put('/oauth/bindUser', async (c) => {
	return c.json(result.ok(await oauthService.bindUser(c, await c.req.json())));
});

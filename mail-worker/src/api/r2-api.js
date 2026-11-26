import r2Service from '../service/r2-service';
import app from '../hono/hono';

app.get('/oss/*', async (c) => {
	const key = c.req.path.split('/oss/')[1];
	if (!key || key.includes('..') || !/^(?:signatures|static|public)\//.test(key)) {
		return c.text('Forbidden: private storage object', 403);
	}
	const resp = await r2Service.toObjResp(c, key);
	if (!resp) {
		return c.notFound();
	}
	return resp;
});



import r2Service from '../service/r2-service';
import app from '../hono/hono';

app.get('/oss/*', async (c) => {
	const key = c.req.path.slice('/oss/'.length);
	return r2Service.response(c, key);
});

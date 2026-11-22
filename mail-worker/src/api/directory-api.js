import app from '../hono/hono';
import result from '../model/result';
import directoryService from '../service/directory-service';

// Company directory. This is the legacy picker route (/directory) and is kept
// so existing caller modules keep working; it now returns the same canonical
// identity shape as GET /user/directory.
app.get('/directory', async (c) => {
	const { list, total } = await directoryService.queryDirectory(c, c.req.query());
	return c.json(result.ok({ list, total }));
});
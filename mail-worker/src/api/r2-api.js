import r2Service from '../service/r2-service';
import app from '../hono/hono';
import { attachmentContentDisposition } from '../utils/attachment-utils';

app.get('/oss/*', async (c) => {
	const key = c.req.path.split('/oss/')[1];
	const obj = await r2Service.getObj(c, key);
	const downloadFilename = c.req.query('filename');
	return new Response(obj.body, {
		headers: {
			'Content-Type': obj.httpMetadata?.contentType || obj.headers?.get?.('Content-Type') || 'application/octet-stream',
			'Content-Disposition': downloadFilename
				? attachmentContentDisposition({ filename: downloadFilename })
				: obj.httpMetadata?.contentDisposition || obj.headers?.get?.('Content-Disposition') || null
		}
	});
});


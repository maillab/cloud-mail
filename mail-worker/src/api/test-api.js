import app from '../hono/hono';
import fileUtils from '../utils/file-utils';

app.get('/test/r2', async (c) => {
	try {
		// Simular exactamente lo que hace saveSendAtt
		const base64 = btoa('test attachment content');
		const buff = fileUtils.base64ToUint8Array(base64);
		const key = 'attachments/savesend-test.txt';

		await c.env.r2.put(key, buff, {
			httpMetadata: {
				contentType: 'text/plain',
				contentDisposition: 'attachment;filename=test.txt'
			}
		});

		const obj = await c.env.r2.get(key);
		return c.json({ success: true, size: buff.length, stored: !!obj });
	} catch (e) {
		return c.json({ success: false, error: e.message });
	}
});

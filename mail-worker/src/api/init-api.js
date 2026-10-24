import app from '../hono/hono';
import { dbInit } from '../init/init';

// 密钥不再放在 URL 中, 避免出现在浏览器历史和访问日志里
const initPage = (message = '') => `<!DOCTYPE html>
<html lang='en'>
<head>
	<meta charset='UTF-8'>
	<meta name='viewport' content='width=device-width, initial-scale=1.0'>
	<meta name='referrer' content='no-referrer'>
	<title>Init database</title>
	<style>body{font-family:sans-serif;max-width:420px;margin:60px auto;padding:0 16px}input,button{font-size:16px;padding:8px;width:100%;box-sizing:border-box;margin-top:8px}</style>
</head>
<body>
	<h3>Initialize / upgrade database</h3>
	${message ? `<p>${message}</p>` : ''}
	<form method='post' action='/api/init' autocomplete='off'>
		<input type='password' name='secret' placeholder='jwt_secret' required>
		<button type='submit'>Run</button>
	</form>
</body>
</html>`;

const htmlHeaders = {
	'Cache-Control': 'no-store',
	'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"
};

app.get('/init', (c) => {
	return c.html(initPage(), 200, htmlHeaders);
});

app.get('/init/:secret', (c) => {
	return c.html(initPage('❌ Passing the secret in the URL is disabled. Enter it below instead, and consider rotating jwt_secret if it was used in a URL before.'), 400, htmlHeaders);
});

app.post('/init', async (c) => {
	const body = await c.req.parseBody().catch(() => ({}));
	const secret = typeof body.secret === 'string' ? body.secret : '';
	const result = await dbInit.init(c, secret);
	return c.html(initPage(result), 200, htmlHeaders);
});

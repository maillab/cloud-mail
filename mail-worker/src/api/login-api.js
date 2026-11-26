import app from '../hono/hono';
import loginService from '../service/login-service';
import result from '../model/result';
import userContext from '../security/user-context';

app.post('/login', async (c) => {
	const data = await loginService.login(c, await c.req.json());
	return c.json(result.ok(data));
});

// MFA verify: consumes a pre-auth challenge token (issued by /login after the
// password stage) plus a TOTP code or recovery code. The member's identity is
// derived from the challenge server-side, so the client never re-sends the
// email or password.
app.post('/auth/mfa/verify', async (c) => {
	const { preAuthToken, code, recoveryCode } = await c.req.json();
	const data = await loginService.verifyMfa(c, preAuthToken, code, recoveryCode);
	return c.json(result.ok(data));
});

app.post('/register', async (c) => {
	const jwt = await loginService.register(c, await c.req.json());
	return c.json(result.ok(jwt));
});

app.delete('/logout', async (c) => {
	await loginService.logout(c, userContext.getUserId(c));
	return c.json(result.ok());
});
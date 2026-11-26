import app from '../hono/hono';
import connectionService from '../service/connection-service';
import securityService from '../service/security-service';
import result from '../model/result';
import userContext from '../security/user-context';
import BizError from '../error/biz-error';

// Connections: a curated catalogue of the external services XPass HQ actually
// integrates with. There is no free-form "new integration" form on purpose --
// an integration that does not exist is worse than a missing entry.

app.get('/connections', async (c) => {
	return c.json(result.ok(await connectionService.overview(c)));
});

app.get('/connections/:provider', async (c) => {
	return c.json(result.ok(await connectionService.get(c, c.req.param('provider'))));
});

// Saving credentials requires a stronger right than merely viewing status:
// whoever can write a provider token can impersonate the company to that
// provider.
app.put('/connections/:provider', async (c) => {
	const provider = c.req.param('provider');
	const body = await c.req.json();
	const item = await connectionService.save(c, provider, body, userContext.getUserId(c), securityService);
	return c.json(result.ok(item));
});

app.delete('/connections/:provider', async (c) => {
	const provider = c.req.param('provider');
	const item = await connectionService.disconnect(c, provider, userContext.getUserId(c));
	return c.json(result.ok(item));
});

// A real verification step performed by the provider adapter (WhatsApp OTP
// accepted, OAuth callback completed). Kept separate from save() so a form
// submission can never mark a provider connected on its own.
app.post('/connections/:provider/verify', async (c) => {
	const provider = c.req.param('provider');
	const body = await c.req.json();
	if (!body.identity) {
		throw new BizError('Provide the verified identity to mark this connection active.');
	}
	await connectionService.markConnected(c, provider, body.identity);
	return c.json(result.ok(await connectionService.get(c, provider)));
});

app.post('/connections/:provider/error', async (c) => {
	const provider = c.req.param('provider');
	const body = await c.req.json();
	await connectionService.markError(c, provider, body.message);
	return c.json(result.ok(await connectionService.get(c, provider)));
});
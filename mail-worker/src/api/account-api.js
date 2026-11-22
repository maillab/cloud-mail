import app from '../hono/hono';
import accountService from '../service/account-service';
import sharedMailbox from '../service/shared-mailbox-service';
import permService from '../service/perm-service';
import result from '../model/result';
import userContext from '../security/user-context';

const uid = c => userContext.getUserId(c);

app.get('/account/list', async (c) => {
	const list = await accountService.list(c, c.req.query(), uid(c));
	return c.json(result.ok(list));
});

// The switcher's source. Same rows as /account/list plus mailbox type, health
// and the caller's mailbox actions, so the UI never has to infer access.
app.get('/account/mailboxes', async (c) => {
	const userId = uid(c);
	const keys = await permService.userPermKeys(c, userId);
	const mailboxes = await sharedMailbox.listForMember(c, userId);
	return c.json(result.ok(mailboxes));
});

// Creating an address makes it a mailbox. Membership for the creator is granted
// immediately; other members are added through mailbox settings.
app.post('/account/sharedMailbox', async (c) => {
	const userId = uid(c);
	const keys = await permService.userPermKeys(c, userId);
	if (!keys.includes('mailbox:manage')) {
		return c.json(result.fail('unauthorized', 403), 403);
	}
	const body = await c.req.json().catch(() => ({}));
	const row = await accountService.createSharedMailbox(c, body, userId);
	return c.json(result.ok(row));
});

app.put('/account/sharedMailbox', async (c) => {
	const userId = uid(c);
	const keys = await permService.userPermKeys(c, userId);
	if (!keys.includes('mailbox:manage')) {
		return c.json(result.fail('unauthorized', 403), 403);
	}
	const body = await c.req.json().catch(() => ({}));
	const row = await accountService.updateSharedMailbox(c, body, userId);
	return c.json(result.ok(row));
});

app.get('/account/mailboxHealth', async (c) => {
	const userId = uid(c);
	const accountId = Number(c.req.query('accountId'));
	await sharedMailbox.assertAccess(c, userId, accountId, 'view');
	return c.json(result.ok(await accountService.refreshHealth(c, accountId)));
});

app.delete('/account/delete', async (c) => {
	await accountService.delete(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.post('/account/add', async (c) => {
	const account = await accountService.add(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(account));
});

app.put('/account/setName', async (c) => {
	await accountService.setName(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/account/setAllReceive', async (c) => {
	await accountService.setAllReceive(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/account/setAsTop', async (c) => {
	await accountService.setAsTop(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/account/signature', async (c) => {
	const signature = await accountService.updateSignature(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(signature));
});

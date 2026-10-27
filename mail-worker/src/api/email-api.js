import app from '../hono/hono';
import emailService from '../service/email-service';
import result from '../model/result';
import userContext from '../security/user-context';
import attService from '../service/att-service';
import mailboxService from '../service/mailbox-service';

const userId = c => userContext.getUserId(c);

app.get('/email/list', async (c) => {
	const data = await emailService.list(c, c.req.query(), userId(c));
	return c.json(result.ok(data));
});

app.get('/email/latest', async (c) => {
	const list = await emailService.latest(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.delete('/email/delete', async (c) => {
	await emailService.delete(c, { ...c.req.query(), permanent: c.req.query('permanent') }, userId(c));
	return c.json(result.ok());
});

app.get('/email/attList', async (c) => {
	const attList = await attService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(attList));
});

app.post('/email/send', async (c) => {
	const email = await emailService.send(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(email));
});

app.put('/email/read', async (c) => {
	await emailService.read(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.get('/mailbox/folders', async (c) => {
	return c.json(result.ok(await mailboxService.listFolders(c, userId(c))));
});

app.get('/mailbox/counts', async (c) => {
	return c.json(result.ok(await mailboxService.counts(c, userId(c))));
});

app.post('/mailbox/folders', async (c) => {
	return c.json(result.ok(await mailboxService.createFolder(c, userId(c), await c.req.json())));
});

app.delete('/mailbox/folders/:folderId', async (c) => {
	await mailboxService.deleteFolder(c, userId(c), c.req.param('folderId'));
	return c.json(result.ok());
});

app.post('/mailbox/move', async (c) => {
	await mailboxService.moveMessages(c, userId(c), await c.req.json());
	return c.json(result.ok());
});

app.put('/mailbox/category', async (c) => {
	await mailboxService.setCategory(c, userId(c), await c.req.json());
	return c.json(result.ok());
});

app.get('/mailbox/templates', async (c) => {
	return c.json(result.ok(await mailboxService.listTemplates(c, userId(c))));
});

app.post('/mailbox/templates', async (c) => {
	return c.json(result.ok(await mailboxService.saveTemplate(c, userId(c), await c.req.json())));
});

app.delete('/mailbox/templates/:templateId', async (c) => {
	await mailboxService.deleteTemplate(c, userId(c), c.req.param('templateId'));
	return c.json(result.ok());
});

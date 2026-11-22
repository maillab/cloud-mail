import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import sharedMailbox from '../service/shared-mailbox-service';
import permService from '../service/perm-service';

const userId = c => userContext.getUserId(c);

// Shared company mailboxes.
//
// Every route answers three questions, in order:
//   1. Does the member's role allow mailbox work at all?
//   2. Is the member a member of THIS mailbox?
//   3. Does the member hold the action this route performs in THAT mailbox?
// A missing membership returns 404, not 403, so a non-member cannot even confirm
// that an address exists.

async function keys(c) {
	return permService.userPermKeys(c, userId(c));
}

// ----- switcher ---------------------------------------------------------

app.get('/shared-mailbox/list', async (c) => {
	const perms = await keys(c);
	await sharedMailbox.assertRoleMail(c, perms, 'view');
	return c.json(result.ok(await sharedMailbox.listForMember(c, userId(c))));
});

// Badge counts for the mail navigation, computed from the live queue.
app.get('/shared-mailbox/summary', async (c) => {
	const perms = await keys(c);
	await sharedMailbox.assertRoleMail(c, perms, 'view');
	return c.json(result.ok(await sharedMailbox.mailboxSummary(c, userId(c))));
});

app.get('/shared-mailbox/current', async (c) => {
	const uid = userId(c);
	const perms = await keys(c);
	await sharedMailbox.assertRoleMail(c, perms, 'view');
	const mailboxes = await sharedMailbox.listForMember(c, uid);
	if (!mailboxes.length) return c.json(result.ok({ mailbox: null, mailboxes: [] }));

	const saved = await sharedMailbox.getLastMailbox(c, uid);
	const preferred = mailboxes.find(item => item.account_id === saved)
		|| mailboxes.find(item => item.mailbox_type === 'personal')
		|| mailboxes[0];
	return c.json(result.ok({ mailbox: preferred, mailboxes, restored: Boolean(saved) }));
});

app.put('/shared-mailbox/select', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const uid = userId(c);
	const perms = await keys(c);
	await sharedMailbox.assertRoleMail(c, perms, 'view');
	// Membership is checked before the preference is stored so a guessed id
	// cannot be persisted and later surfaced.
	await sharedMailbox.assertAccess(c, uid, body.mailboxId, 'view');
	await sharedMailbox.setLastMailbox(c, uid, body.mailboxId);
	return c.json(result.ok());
});

// ----- conversations ----------------------------------------------------

app.get('/shared-mailbox/conversations', async (c) => {
	const uid = userId(c);
	const perms = await keys(c);
	await sharedMailbox.assertRoleMail(c, perms, 'view');
	return c.json(result.ok(await sharedMailbox.listConversations(c, uid, c.req.query())));
});

app.get('/shared-mailbox/conversation', async (c) => {
	const uid = userId(c);
	const perms = await keys(c);
	await sharedMailbox.assertRoleMail(c, perms, 'view');
	return c.json(result.ok(await sharedMailbox.conversationDetail(c, uid, c.req.query('emailId'))));
});

app.get('/shared-mailbox/timeline', async (c) => {
	const uid = userId(c);
	const perms = await keys(c);
	await sharedMailbox.assertRoleMail(c, perms, 'view');
	return c.json(result.ok(await sharedMailbox.conversationTimeline(c, uid, c.req.query('emailId'))));
});

app.post('/shared-mailbox/note', async (c) => {
	const uid = userId(c);
	const perms = await keys(c);
	await sharedMailbox.assertRoleMail(c, perms, 'view');
	const body = await c.req.json().catch(() => ({}));
	return c.json(result.ok(await sharedMailbox.addNote(c, uid, body.emailId, body.body)));
});

app.post('/shared-mailbox/link-request', async (c) => {
	const uid = userId(c);
	const perms = await keys(c);
	await sharedMailbox.assertRoleMail(c, perms, 'view');
	const body = await c.req.json().catch(() => ({}));
	return c.json(result.ok(await sharedMailbox.linkRequest(c, uid, body.emailId, body.requestId, body.summary)));
});

// A conversation carries one workflow action at a time: status, resolution,
// priority, assignment or tags. Keeping them behind one route means the member
// only ever holds one "change this conversation" call, and every branch records
// its own timeline entry.
app.put('/shared-mailbox/conversation', async (c) => {
	const uid = userId(c);
	const perms = await keys(c);
	const body = await c.req.json().catch(() => ({}));
	// Only assignment, tags and member-visible workflow changes are gated here;
	// replying/sending is gated deeper, in the email service.
	await sharedMailbox.assertRoleMail(c, perms, 'view');
	if (body.action === 'resolve') {
		return c.json(result.ok(await sharedMailbox.resolve(c, userId(c), body.emailId, body.comment)));
	}
	if (body.action === 'reopen') {
		return c.json(result.ok(await sharedMailbox.reopen(c, userId(c), body.emailId, body.comment)));
	}
	if (body.action === 'priority') {
		return c.json(result.ok(await sharedMailbox.setPriority(c, userId(c), body.emailId, body.priority)));
	}
	if (body.action === 'assign') {
		return c.json(result.ok(await sharedMailbox.assign(c, userId(c), body.emailId, body.assigneeId, body.comment)));
	}
	if (body.action === 'tags') {
		return c.json(result.ok(await sharedMailbox.setConversationTags(c, userId(c), body.emailId, body.tagIds)));
	}
	return c.json(result.ok(await sharedMailbox.setStatus(c, userId(c), body.emailId, body.status, body.comment)));
});

app.get('/shared-mailbox/assignees', async (c) => {
	const uid = userId(c);
	const perms = await keys(c);
	await sharedMailbox.assertRoleMail(c, perms, 'view');
	const mailboxId = Number(c.req.query('mailboxId'));
	await sharedMailbox.assertAccess(c, uid, mailboxId, 'view');
	return c.json(result.ok(await sharedMailbox.memberOptions(c, mailboxId)));
});

// ----- tags -------------------------------------------------------------

app.get('/shared-mailbox/tags', async (c) => {
	const perms = await keys(c);
	await sharedMailbox.assertRoleMail(c, perms, 'view');
	return c.json(result.ok(await sharedMailbox.listTags(c)));
});

app.post('/shared-mailbox/tags', async (c) => {
	const uid = userId(c);
	const perms = await keys(c);
	await sharedMailbox.assertRoleMail(c, perms, 'manage');
	const body = await c.req.json().catch(() => ({}));
	return c.json(result.ok(await sharedMailbox.createTag(c, uid, body.name, body.color)));
});

app.delete('/shared-mailbox/tags/:tagId', async (c) => {
	const perms = await keys(c);
	await sharedMailbox.assertRoleMail(c, perms, 'manage');
	await sharedMailbox.deleteTag(c, c.req.param('tagId'));
	return c.json(result.ok());
});

// ----- admin ------------------------------------------------------------

// Company-wide roster of shared mailboxes for the admin management screen.
// Gated by the 'mailbox:manage' role permission, not by per-mailbox membership.
app.get('/shared-mailbox/admin/list', async (c) => {
	const perms = await keys(c);
	await sharedMailbox.assertRoleMail(c, perms, 'manage');
	return c.json(result.ok(await sharedMailbox.listSharedMailboxes(c)));
});

// People who can be added to a shared inbox. This intentionally belongs to
// mailbox administration rather than the general Members screen: an inbox
// owner must be able to set up their own queue without also receiving every
// company-administration right.
app.get('/shared-mailbox/member-options', async (c) => {
	const perms = await keys(c);
	await sharedMailbox.assertRoleMail(c, perms, 'manage');
	const { results } = await c.env.db.prepare(`
		SELECT user_id, email, display_name, username, job_title
		FROM user
		WHERE COALESCE(is_del, 0) = 0 AND COALESCE(status, 0) = 0
		ORDER BY COALESCE(display_name, email) COLLATE NOCASE
	`).all();
	return c.json(result.ok((results || []).map(row => ({
		userId: row.user_id,
		email: row.email,
		name: row.display_name || row.username || row.email,
		username: row.username || '',
		jobTitle: row.job_title || ''
	}))));
});

// ----- members ----------------------------------------------------------

app.get('/shared-mailbox/members', async (c) => {
	const uid = userId(c);
	const perms = await keys(c);
	await sharedMailbox.assertRoleMail(c, perms, 'manage');
	const mailboxId = Number(c.req.query('mailboxId'));
	// Administering members is either a per-mailbox capability or a company-wide
	// administrator right (mailbox:manage).
	await sharedMailbox.assertManageMembers(c, uid, mailboxId);
	return c.json(result.ok(await sharedMailbox.listMembers(c, uid, mailboxId)));
});

app.post('/shared-mailbox/members', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	return c.json(result.ok(await sharedMailbox.addMember(
		c, userId(c), body.mailboxId, body.userId, body.permissions
	)));
});

app.put('/shared-mailbox/members', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	return c.json(result.ok(await sharedMailbox.updateMemberPermissions(
		c, userId(c), body.mailboxId, body.userId, body.permissions
	)));
});

app.delete('/shared-mailbox/:mailboxId', async (c) => {
	const uid = userId(c);
	const perms = await keys(c);
	await sharedMailbox.assertRoleMail(c, perms, 'manage');
	const body = await c.req.json().catch(() => ({}));
	await sharedMailbox.deleteSharedMailbox(c, uid, c.req.param('mailboxId'), body.confirmEmail);
	return c.json(result.ok());
});

app.delete('/shared-mailbox/members', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	return c.json(result.ok(await sharedMailbox.removeMember(c, userId(c), body.mailboxId, body.userId)));
});

app.get('/shared-mailbox/member-audit', async (c) => {
	const uid = userId(c);
	const perms = await keys(c);
	await sharedMailbox.assertRoleMail(c, perms, 'manage');
	const mailboxId = Number(c.req.query('mailboxId'));
	await sharedMailbox.assertManageMembers(c, uid, mailboxId);
	return c.json(result.ok(await sharedMailbox.memberAudit(c, mailboxId)));
});

import BizError from '../error/biz-error';
import permService from './perm-service';
import userService from './user-service';
import { isSharedMailbox } from './mailbox-identity';

// Shared company mailboxes.
//
// A mailbox is an account row. Members are rows in mailbox_member. A shared
// conversation is one inbound/outbound message plus its workflow metadata, so
// the mail engine keeps owning message storage and this service owns who may do
// what with it.
//
// Two gates apply to every shared-mailbox operation:
//   1. Role permission (what may this member do anywhere): email:query / email:send
//      / mailbox:manage.
//   2. Mailbox membership (which mailbox is this): a view row in mailbox_member.
// Both must pass. Hiding an address in the sidebar is never access control.

export const MAILBOX_ACTIONS = [
	'view', 'reply', 'send', 'assign', 'reassign', 'internal_note',
	'manage_tags', 'resolve', 'bulk_actions', 'configure', 'manage_members'
];

const DEFAULT_PERMISSIONS = 'view,reply,send,assign,reassign,internal_note,manage_tags,resolve,bulk_actions';
const OWNER_PERMISSIONS = MAILBOX_ACTIONS.join(',');

// 'new' is an inbox that has not been touched yet; 'unassigned' is a conversation
// with no current handler. Keeping them apart lets the queue show unopened mail
// without lying about who owns it.
const STATUSES = ['new', 'unassigned', 'assigned', 'in_progress', 'waiting_customer', 'waiting_internal', 'resolved'];
const PRIORITIES = ['normal', 'high', 'urgent'];
const TERMINAL_REQUEST_STATUSES = new Set(['approved', 'completed', 'declined', 'cancelled']);

function database(c) {
	return c.env.db;
}

// Personal and shared mailboxes are both 'account' rows, so the existing mail
// engine keeps owning message storage. Only shared addresses get workflow
// metadata; a personal mailbox never creates a conversation row.

export function normalizeActionList(value) {
	const raw = Array.isArray(value) ? value : String(value || '').split(',');
	const picked = [...new Set(raw.map(item => String(item).trim()).filter(item => MAILBOX_ACTIONS.includes(item)))];
	return picked.length ? picked : ['view'];
}

function actionSet(permissions) {
	return new Set(normalizeActionList(permissions));
}

function normalizeStatus(value, fallback = 'unassigned') {
	const status = String(value ?? '').trim().toLowerCase();
	return STATUSES.includes(status) ? status : fallback;
}

function normalizePriority(value, fallback = 'normal') {
	const priority = String(value ?? '').trim().toLowerCase();
	return PRIORITIES.includes(priority) ? priority : fallback;
}

function cleanText(value, maxLength) {
	const text = String(value ?? '').trim();
	if (!text) return '';
	if (text.length > maxLength) {
		throw new BizError(`Text must be ${maxLength} characters or fewer.`, 400);
	}
	return text;
}

function requireAction(sets, action, label) {
	if (!sets.has(action)) {
		throw new BizError(`You do not have ${label} permission for this mailbox.`, 403);
	}
}

// The role-level gate. Membership alone must never be enough: a member of a
// shared mailbox whose role cannot read mail at all is still not allowed to.
export async function assertRoleMail(c, keys, action) {
	const resolved = Array.isArray(keys) ? keys : await permService.userPermKeys(c, keys);
	const allowed = action === 'send'
		? ['email:send']
		: action === 'manage'
			? ['mailbox:manage', 'account:add']
			: ['email:query'];
	if (allowed.some(key => resolved.includes(key))) return;
	throw new BizError('Your role does not allow mailbox access.', 403);
}

export async function listForMember(c, userId) {
	const { results } = await database(c).prepare(`
		SELECT a.account_id, a.email, a.name, a.display_name, a.mailbox_type, a.mailbox_status,
		       a.inbound_state, a.outbound_state, a.health_checked_at, m.permissions,
		       m.status AS member_status,
		       (SELECT COUNT(*) FROM email e
		         WHERE e.account_id = a.account_id AND e.type = 0 AND e.unread = 0
		           AND e.is_del = 0 AND e.mailbox_folder = 'inbox') AS unread_count,
		       (SELECT COUNT(*) FROM mailbox_conversation mc
		         WHERE mc.mailbox_id = a.account_id AND mc.assigned_to = ? 
		           AND mc.status NOT IN ('resolved')) AS assigned_count
		FROM mailbox_member m
		JOIN account a ON a.account_id = m.mailbox_id
		WHERE m.user_id = ? AND m.status = 'active' AND COALESCE(a.is_del, 0) = 0
		ORDER BY CASE a.mailbox_type WHEN 'personal' THEN 0 ELSE 1 END, a.email COLLATE NOCASE
	`).bind(userId, userId).all();
	return results;
}

// Administering members can come from two places: a mailbox member who holds
// the per-mailbox 'manage_members' action, or a company administrator whose
// role carries 'mailbox:manage'. The second path lets an admin set up and run
// every shared mailbox without first being added to each one.
export async function assertManageMembers(c, userId, mailboxId) {
	const keys = await permService.userPermKeys(c, userId);
	if (keys.includes('mailbox:manage') || keys.includes('*')) return;
	await assertAccess(c, userId, mailboxId, 'manage_members');
}

// Every shared mailbox in the company, for the admin management screen. Unlike
// listForMember this is not scoped to the caller's own memberships: it is the
// company-wide roster and is gated by 'mailbox:manage' at the handler.
export async function listSharedMailboxes(c) {
	const { results } = await database(c).prepare(`
		SELECT a.account_id, a.email, a.name, a.display_name, a.mailbox_status,
		       a.inbound_state, a.outbound_state, a.health_checked_at,
		       (SELECT COUNT(*) FROM mailbox_member mm
		         WHERE mm.mailbox_id = a.account_id AND mm.status = 'active') AS member_count,
		       (SELECT COUNT(*) FROM email e
		         WHERE e.account_id = a.account_id AND e.type = 0 AND e.unread = 0
		           AND e.is_del = 0 AND e.mailbox_folder = 'inbox') AS unread_count
		FROM account a
		WHERE a.mailbox_type = 'shared' AND COALESCE(a.is_del, 0) = 0
		ORDER BY a.email COLLATE NOCASE
	`).all();
	return results;
}

export async function deleteSharedMailbox(c, userId, mailboxId, confirmEmail) {
	const id = Number(mailboxId);
	if (!Number.isSafeInteger(id) || id <= 0) throw new BizError('Invalid mailbox.', 400);
	const row = await database(c).prepare(`SELECT account_id, email, mailbox_type FROM account WHERE account_id = ? AND COALESCE(is_del, 0) = 0`).bind(id).first();
	if (!row || !isSharedMailbox(row.mailbox_type)) throw new BizError('Shared mailbox not found.', 404);
	if (String(confirmEmail || '').trim().toLowerCase() !== String(row.email).toLowerCase()) throw new BizError('Type the mailbox address to confirm deletion.', 400);
	await database(c).prepare(`UPDATE account SET is_del = 1, mailbox_status = 'disabled' WHERE account_id = ?`).bind(id).run();
	await database(c).prepare(`UPDATE mailbox_member SET status = 'removed', updated_at = CURRENT_TIMESTAMP WHERE mailbox_id = ?`).bind(id).run();
	await database(c).prepare(`DELETE FROM mailbox_preference WHERE last_mailbox_id = ?`).bind(id).run();
}

export async function assertAccess(c, userId, mailboxId, action = 'view') {
	const id = Number(mailboxId);
	if (!Number.isSafeInteger(id) || id <= 0) {
		throw new BizError('Invalid mailbox.', 400);
	}
	const row = await database(c).prepare(`
		SELECT a.account_id, a.email, a.display_name, a.mailbox_type, a.mailbox_status,
		       a.inbound_state, a.outbound_state, a.health_checked_at,
		       m.permissions, m.id AS member_id
		FROM mailbox_member m
		JOIN account a ON a.account_id = m.mailbox_id
		WHERE m.mailbox_id = ? AND m.user_id = ? AND m.status = 'active'
	`).bind(id, userId).first();
	if (!row) {
		// Deliberately "not found" rather than "forbidden": confirming that a
		// shared address exists is itself a leak.
		throw new BizError('Mailbox not found.', 404);
	}
	if (row.mailbox_status !== 'active') {
		throw new BizError('This mailbox is disabled.', 403);
	}
	const sets = actionSet(row.permissions);
	requireAction(sets, action, action === 'view' ? 'view' : action);
	return { ...row, actions: [...sets] };
}

export async function findMembership(c, userId, mailboxId) {
	const id = Number(mailboxId);
	if (!Number.isSafeInteger(id) || id <= 0) return null;
	return database(c).prepare(
		`SELECT id, mailbox_id, user_id, permissions, status FROM mailbox_member WHERE mailbox_id = ? AND user_id = ?`
	).bind(id, userId).first();
}

function isSharedRow(row) {
	return isSharedMailbox(row?.mailboxType ?? row?.mailbox_type);
}

// The creator is the mailbox owner. They must be able to work the inbox as
// well as configure it; requiring them to add themselves a second time made a
// new mailbox look broken immediately after setup.
export async function grantAdminMembership(c, userId, mailboxId) {
	const existing = await findMembership(c, userId, mailboxId);
	if (existing) {
		await database(c).prepare(`
			UPDATE mailbox_member
			SET permissions = ?, status = 'active', updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`).bind(OWNER_PERMISSIONS, existing.id).run();
		return findMembership(c, userId, mailboxId);
	}
	await database(c).prepare(`
		INSERT OR IGNORE INTO mailbox_member (mailbox_id, user_id, permissions, status, created_by, created_at, updated_at)
		VALUES (?, ?, ?, 'active', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`).bind(Number(mailboxId), userId, OWNER_PERMISSIONS, userId).run();
	return findMembership(c, userId, mailboxId);
}

export async function setLastMailbox(c, userId, mailboxId) {
	const id = Number(mailboxId);
	if (!Number.isSafeInteger(id) || id <= 0) return;
	await database(c).prepare(`
		INSERT INTO mailbox_preference (user_id, last_mailbox_id, updated_at)
		VALUES (?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(user_id) DO UPDATE SET last_mailbox_id = excluded.last_mailbox_id, updated_at = CURRENT_TIMESTAMP
	`).bind(userId, id).run();
}

export async function getLastMailbox(c, userId) {
	const row = await database(c).prepare(`SELECT last_mailbox_id FROM mailbox_preference WHERE user_id = ?`).bind(userId).first();
	return row?.last_mailbox_id ?? null;
}

// ---------- conversation -------------------------------------------------

function isAddressedToMe(row, userId) {
	if (row.type === 1) return row.userId === userId;
	const sender = String(row.sendEmail || '').toLowerCase();
	const member = String(row.member_email || '').toLowerCase();
	return Boolean(sender && member && sender === member);
}

// A conversation is a thread, so a message can belong to one while not being
// the message that opened it. The join table is checked first and the legacy
// single-message column is the fallback, so rows created before the thread
// migration still resolve.
export async function conversationForEmail(c, emailId) {
	const id = Number(emailId);
	if (!Number.isSafeInteger(id) || id <= 0) return null;
	const linked = await database(c).prepare(`
		SELECT mc.* FROM mailbox_conversation mc
		JOIN mailbox_conversation_message m ON m.conversation_id = mc.id
		WHERE m.email_id = ?
	`).bind(id).first();
	if (linked) return linked;
	return database(c).prepare(`SELECT * FROM mailbox_conversation WHERE email_id = ?`).bind(id).first();
}

// Records that a message belongs to a conversation. Idempotent, because a
// reply is retried and must not fork the thread.
async function attachMessage(c, conversationId, emailId) {
	const id = Number(emailId);
	if (!conversationId || !Number.isSafeInteger(id) || id <= 0) return;
	await database(c).prepare(`
		INSERT OR IGNORE INTO mailbox_conversation_message (conversation_id, email_id)
		VALUES (?, ?)
	`).bind(conversationId, id).run();
}

async function messageCount(c, conversationId) {
	const row = await database(c).prepare(`
		SELECT COUNT(*) AS n FROM mailbox_conversation_message WHERE conversation_id = ?
	`).bind(conversationId).first();
	return row?.n ?? 0;
}

async function logEvent(c, conversationId, actorId, action, fromValue = '', toValue = '', note = '') {
	await database(c).prepare(`
		INSERT INTO mailbox_conversation_event (conversation_id, actor_id, action, from_value, to_value, note)
		VALUES (?, ?, ?, ?, ?, ?)
	`).bind(conversationId, actorId ?? null, action, fromValue, toValue, note).run();
}

function labelFor(userId, users) {
	if (!userId) return 'Unassigned';
	const row = users[String(userId)];
	if (!row) return `Member #${userId}`;
	const name = row.displayName || row.email || `Member #${userId}`;
	return row.username ? `${name} (@${row.username})` : name;
}

async function memberLabels(c, userIds) {
	const ids = [...new Set(userIds.filter(Boolean).map(Number))];
	if (!ids.length) return {};
	const placeholders = ids.map(() => '?').join(',');
	const { results } = await database(c).prepare(`
		SELECT user_id, display_name, username, email FROM user WHERE user_id IN (${placeholders})
	`).bind(...ids).all();
	return Object.fromEntries((results || []).map(row => [String(row.user_id), row]));
}

async function tagList(c, conversationId) {
	const { results } = await database(c).prepare(`
		SELECT t.id, t.name, t.color FROM mailbox_tag t
		JOIN mailbox_conversation_tag ct ON ct.tag_id = t.id
		WHERE ct.conversation_id = ?
		ORDER BY t.name COLLATE NOCASE
	`).bind(conversationId).all();
	return results;
}

export async function listConversations(c, userId, params) {
	const requestedMailboxId = String(params.mailboxId || '');
	const allShared = requestedMailboxId === 'all' || requestedMailboxId === '0';
	const mailboxId = Number(requestedMailboxId);
	const mailbox = allShared ? null : await assertAccess(c, userId, mailboxId, 'view');
	const status = params.status ? String(params.status) : '';
	const excludeStatus = params.excludeStatus ? String(params.excludeStatus) : '';
	const priority = params.priority ? String(params.priority) : '';
	const tagId = Number(params.tagId) || 0;
	const assignedToMe = Number(params.assignedToMe) === 1;
	const search = cleanText(params.search, 200);
	const page = Math.max(1, Number(params.page) || 1);
	const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 30));

	const where = [allShared
		? `mc.mailbox_id IN (SELECT m.mailbox_id FROM mailbox_member m JOIN account a ON a.account_id = m.mailbox_id WHERE m.user_id = ? AND m.status = 'active' AND a.mailbox_type = 'shared' AND COALESCE(a.is_del, 0) = 0)`
		: `mc.mailbox_id = ?`, `e.is_del = 0`];
	const args = [allShared ? userId : mailboxId];
	if (status) {
		if (!STATUSES.includes(status)) throw new BizError('Invalid status.', 400);
		where.push('mc.status = ?'); args.push(status);
	}
	if (excludeStatus) {
		if (!STATUSES.includes(excludeStatus)) throw new BizError('Invalid status.', 400);
		where.push('mc.status <> ?'); args.push(excludeStatus);
	}
	if (assignedToMe) {
		where.push('mc.assigned_to = ?'); args.push(userId);
	}
	if (priority) {
		if (!PRIORITIES.includes(priority)) throw new BizError('Invalid priority.', 400);
		where.push('mc.priority = ?'); args.push(priority);
	}
	if (tagId) {
		where.push(`EXISTS (SELECT 1 FROM mailbox_conversation_tag ct WHERE ct.conversation_id = mc.id AND ct.tag_id = ?)`);
		args.push(tagId);
	}
	if (search) {
		where.push(`(e.subject COLLATE NOCASE LIKE ? OR e.send_email COLLATE NOCASE LIKE ? OR e.text COLLATE NOCASE LIKE ?)`);
		const like = `%${search}%`;
		args.push(like, like, like);
	}
	const whereSql = where.join(' AND ');
	const offset = (page - 1) * pageSize;

	// The conversation's subject and last message come from the most recent
// message in the thread, not from the one that opened it.
	const latestEmailSql = `COALESCE((
		SELECT m.email_id FROM mailbox_conversation_message m
		WHERE m.conversation_id = mc.id
		ORDER BY m.created_at DESC, m.email_id DESC LIMIT 1
	), mc.email_id)`;

	const { results } = await database(c).prepare(`
		SELECT mc.id AS conversation_id, mc.email_id AS root_email_id, e.email_id AS email_id,
		       mc.status, mc.priority, mc.assigned_to,
		       mc.last_handled_by, mc.related_type, mc.related_id, mc.resolved_at, mc.updated_at,
		       e.subject, e.send_email, e.name AS sender_name, e.to_email, e.type AS message_type,
		       e.create_time, e.unread, e.account_id, e.text AS snippet,
		       (SELECT COUNT(*) FROM mailbox_conversation_message m2 WHERE m2.conversation_id = mc.id) AS message_count
		FROM mailbox_conversation mc
		JOIN email e ON e.email_id = ${latestEmailSql}
		WHERE ${whereSql}
		ORDER BY (mc.status = 'resolved') ASC, (mc.priority = 'urgent') DESC, e.create_time DESC
		LIMIT ? OFFSET ?
	`).bind(...args, pageSize, offset).all();

	const total = await database(c).prepare(`
		SELECT COUNT(*) AS total FROM mailbox_conversation mc
		JOIN email e ON e.email_id = ${latestEmailSql}
		WHERE ${whereSql}
	`).bind(...args).first();

	const assignees = await memberLabels(c, (results || []).map(row => row.assigned_to));
	const tags = results?.length
		? await Promise.all((results || []).map(row => tagList(c, row.conversation_id)))
		: [];
	const list = (results || []).map((row, index) => ({
		...row,
		assignee: row.assigned_to ? (assignees[String(row.assigned_to)] || null) : null,
		assignee_label: labelFor(row.assigned_to, assignees),
		tags: tags[index] || []
	}));

	return { list, total: total?.total ?? 0, mailbox: allShared ? { id: 0, email: '', actions: ['view'] } : { id: mailbox.account_id, email: mailbox.email, actions: mailbox.actions } };
}

// Badge counts for the mail navigation. These are computed per request so the
// numbers can never drift from the queue itself, and they are never invented:
// a count only exists if the query found it.
export async function mailboxSummary(c, userId) {
	const mailboxes = await listForMember(c, userId);
	const shared = mailboxes.filter(row => row.mailbox_type !== 'personal');
	const summary = [];
	for (const mailbox of shared) {
		const row = await database(c).prepare(`
			SELECT
				SUM(CASE WHEN mc.status = 'new' THEN 1 ELSE 0 END) AS fresh,
				SUM(CASE WHEN mc.status = 'unassigned' OR (mc.assigned_to IS NULL AND mc.status = 'in_progress') THEN 1 ELSE 0 END) AS unassigned,
				SUM(CASE WHEN mc.assigned_to = ? AND mc.status NOT IN ('resolved') THEN 1 ELSE 0 END) AS mine,
				SUM(CASE WHEN mc.status = 'waiting_internal' THEN 1 ELSE 0 END) AS waiting_internal,
				SUM(CASE WHEN mc.status = 'resolved' THEN 0 ELSE 1 END) AS open,
				SUM(CASE WHEN mc.priority = 'urgent' AND mc.status NOT IN ('resolved') THEN 1 ELSE 0 END) AS urgent,
				COUNT(*) AS total
			FROM mailbox_conversation mc
			JOIN email e ON e.email_id = mc.email_id
			WHERE mc.mailbox_id = ? AND e.is_del = 0
		`).bind(userId, mailbox.account_id).first();
		summary.push({
			mailbox_id: mailbox.account_id,
			email: mailbox.email,
			display_name: mailbox.display_name,
			actions: mailbox.actions,
			counts: {
				new: row?.fresh ?? 0,
				unassigned: row?.unassigned ?? 0,
				mine: row?.mine ?? 0,
				waiting_internal: row?.waiting_internal ?? 0,
				urgent: row?.urgent ?? 0,
				open: row?.open ?? 0,
				total: row?.total ?? 0,
			},
		});
	}
	return summary;
}

export async function conversationDetail(c, userId, emailId) {
	const id = Number(emailId);
	if (!Number.isSafeInteger(id) || id <= 0) throw new BizError('Invalid message.', 400);

	const emailRow = await database(c).prepare(`
		SELECT e.*, a.mailbox_type, a.display_name AS mailbox_display_name, a.email AS mailbox_email
		FROM email e JOIN account a ON a.account_id = e.account_id
		WHERE e.email_id = ? AND e.is_del = 0
	`).bind(id).first();
	if (!emailRow) throw new BizError('Message not found.', 404);
	if (!isSharedMailbox(emailRow.mailbox_type)) {
		throw new BizError('Message not found.', 404);
	}

	const access = await assertAccess(c, userId, emailRow.account_id, 'view');
	const conversation = await conversationForEmail(c, id);
	if (!conversation) {
		// Not yet operationalised: still a readable message, just without a
		// workflow. This keeps existing shared mail usable.
		return { email: emailRow, conversation: null, events: [], actions: access.actions, tags: [] };
	}

	const events = await database(c).prepare(`
		SELECT ev.*, u.display_name, u.username, u.email
		FROM mailbox_conversation_event ev
		LEFT JOIN user u ON u.user_id = ev.actor_id
		WHERE ev.conversation_id = ?
		ORDER BY ev.create_time ASC, ev.id ASC
	`).bind(conversation.id).all();

	const actorIds = (events.results || []).map(row => row.actor_id).filter(Boolean);
	const assignees = await memberLabels(c, [conversation.assigned_to, conversation.last_handled_by, ...actorIds]);

	// The thread is every message attached to the conversation, oldest first.
	// Plain SQL join, so nothing is fetched that the member cannot read: every
	// message is already scoped to this mailbox.
	const messages = await database(c).prepare(`
		SELECT e.email_id, e.subject, e.type, e.send_email, e.to_email, e.text, e.content,
		       e.create_time, e.unread, e.mailbox_folder
		FROM mailbox_conversation_message m
		JOIN email e ON e.email_id = m.email_id
		WHERE m.conversation_id = ? AND e.is_del = 0
		ORDER BY e.create_time ASC, e.email_id ASC
	`).bind(conversation.id).all();

	return {
		email: emailRow,
		conversation: {
			...conversation,
			message_count: messages.results?.length ?? 0,
			assignee: conversation.assigned_to ? (assignees[String(conversation.assigned_to)] || null) : null,
			assignee_label: labelFor(conversation.assigned_to, assignees),
			last_handled_label: conversation.last_handled_by ? labelFor(conversation.last_handled_by, assignees) : null
		},
		messages: messages.results || [],
		tags: await tagList(c, conversation.id),
		events: (events.results || []).map(event => ({
			...event,
			actor_label: event.actor_id ? labelFor(event.actor_id, assignees) : 'System'
		})),
		actions: access.actions
	};
}

// Records a message on a shared mailbox against the right conversation.
//
// Direction matters: a customer message opens a thread, while our own message
// means we are now waiting for their reply. A reply (parentEmailId) never opens
// a new conversation — it lands on the thread it answers, which is what keeps
// the assignee, tags and history of that thread intact.
export async function registerMessage(c, params = {}) {
	const { emailId, mailboxId, direction, actorId = null, subject = '', parentEmailId = null } = params;
	const id = Number(emailId);
	if (!Number.isSafeInteger(id) || id <= 0) return null;

	const existing = await conversationForEmail(c, id);
	if (existing) {
		await attachMessage(c, existing.id, id);
		return existing;
	}

	const parent = parentEmailId ? await conversationForEmail(c, parentEmailId) : null;
	const db = database(c);

	if (parent) {
		await attachMessage(c, parent.id, id);
		// A customer reply reopens the thread but must not silently drop the
		// person who was handling it. Our own reply means the ball is now in
		// the customer's court, which is exactly what the queue filters on.
		const nextStatus = direction === 'incoming'
			? `CASE WHEN status IN ('resolved','waiting_customer','new','unassigned') THEN 'in_progress' ELSE status END`
			: `'waiting_customer'`;
		await db.prepare(`
			UPDATE mailbox_conversation
			SET status = ${nextStatus}, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`).bind(parent.id).run();
		await logEvent(
			c, parent.id, actorId,
			direction === 'incoming' ? 'reply_received' : 'replied',
			'', subject,
			direction === 'incoming'
				? 'Customer replied. Conversation reopened.'
				: 'Replied from the shared mailbox. Waiting for customer.'
		);
		return conversationForEmail(c, id);
	}

	const status = direction === 'incoming' ? 'new' : 'waiting_customer';
	const { meta } = await db.prepare(`
		INSERT INTO mailbox_conversation (mailbox_id, email_id, status, priority, last_handled_by, created_at, updated_at)
		VALUES (?, ?, ?, 'normal', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`).bind(Number(mailboxId), id, status, actorId ?? null).run();

	const conversationId = meta.last_row_id;
	await attachMessage(c, conversationId, id);
	await logEvent(
		c, conversationId, actorId,
		direction === 'incoming' ? 'received' : 'sent',
		'', subject,
		direction === 'incoming' ? 'Message received.' : 'Message sent from the shared mailbox.'
	);
	return conversationForEmail(c, id);
}

export async function registerIncoming(c, emailId, mailboxId, parentEmailId = null, actorId = null, subject = '') {
	return registerMessage(c, { emailId, mailboxId, direction: 'incoming', actorId, subject, parentEmailId });
}

export async function registerOutgoing(c, emailId, mailboxId, parentEmailId = null, actorId = null, subject = '') {
	return registerMessage(c, { emailId, mailboxId, direction: 'outgoing', actorId, subject, parentEmailId });
}

async function requireConversation(c, userId, emailId, action) {
	const id = Number(emailId);
	if (!Number.isSafeInteger(id) || id <= 0) throw new BizError('Invalid message.', 400);
	const emailRow = await database(c).prepare(`
		SELECT e.*, a.mailbox_type FROM email e JOIN account a ON a.account_id = e.account_id
		WHERE e.email_id = ? AND e.is_del = 0
	`).bind(id).first();
	if (!emailRow || !isSharedMailbox(emailRow.mailbox_type)) {
		throw new BizError('Message not found.', 404);
	}
	const access = await assertAccess(c, userId, emailRow.account_id, action === 'internal_note' ? 'internal_note' : action);
	const conversation = await conversationForEmail(c, id);
	if (!conversation) throw new BizError('This message is not part of a shared conversation.', 404);
	return { emailRow, access, conversation };
}

export async function setStatus(c, userId, emailId, status, comment = '') {
	const { conversation } = await requireConversation(c, userId, emailId, 'resolve');
	const next = normalizeStatus(status, conversation.status);
	if (next === conversation.status) {
		return conversationForEmail(c, emailId);
	}
	const nowResolved = next === 'resolved';
	await database(c).prepare(`
		UPDATE mailbox_conversation
		SET status = ?, resolved_at = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`).bind(next, nowResolved ? new Date().toISOString() : null, conversation.id).run();
	await logEvent(c, conversation.id, userId, 'status', conversation.status, next, comment);
	return conversationForEmail(c, emailId);
}

export async function resolve(c, userId, emailId, comment = '') {
	return setStatus(c, userId, emailId, 'resolved', comment);
}

export async function reopen(c, userId, emailId, comment = '') {
	const { conversation } = await requireConversation(c, userId, emailId, 'resolve');
	const next = 'in_progress';
	await database(c).prepare(`
		UPDATE mailbox_conversation SET status = ?, resolved_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
	`).bind(next, conversation.id).run();
	await logEvent(c, conversation.id, userId, 'reopen', conversation.status, next, comment);
	return conversationForEmail(c, emailId);
}

async function assertUserActive(c, targetId) {
	const target = await userService.selectById(c, Number(targetId));
	if (!target) throw new BizError('That team member was not found.', 404);
	if (target.status !== 0) throw new BizError('That team member cannot be added.', 400);
	return target;
}

async function assertAssignable(c, mailboxId, targetId) {
	const target = await userService.selectById(c, Number(targetId));
	if (!target) throw new BizError('That team member was not found.', 404);
	if (target.status !== 0) throw new BizError('That team member cannot be assigned work.', 400);
	const membership = await findMembership(c, target.userId, mailboxId);
	if (!membership || membership.status !== 'active') {
		throw new BizError('That team member has no access to this mailbox.', 400);
	}
	if (!actionSet(membership.permissions).has('view')) {
		throw new BizError('That team member cannot view this mailbox.', 400);
	}
	return target;
}

export async function assign(c, userId, emailId, targetId, comment = '') {
	const { conversation } = await requireConversation(c, userId, emailId, 'assign');
	if (targetId !== null && targetId !== undefined && targetId !== '' && Number(targetId) !== userId) {
		await assertAssignable(c, conversation.mailbox_id, targetId);
	}
	const previous = conversation.assigned_to ?? null;
	const next = targetId === null || targetId === undefined || targetId === ''
		? null
		: Number(targetId);
	const nextStatus = next === null
		? 'unassigned'
		: (conversation.status === 'unassigned' || conversation.status === 'resolved' ? 'assigned' : conversation.status);

	await database(c).prepare(`
		UPDATE mailbox_conversation
		SET assigned_to = ?, status = ?, last_handled_by = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`).bind(next, nextStatus, userId, conversation.id).run();

	const labels = await memberLabels(c, [previous, next]);
	const action = previous === null ? 'assigned' : (next === null ? 'unassigned' : 'transferred');
	const summary = action === 'assigned'
		? `${labels[String(next)] ? labelFor(next, labels) : 'A member'} assigned this conversation to ${labelFor(next, labels)}.`
		: action === 'unassigned'
			? `${labelFor(userId, labels)} unassigned this conversation.`
			: `${labelFor(userId, labels)} transferred this conversation to ${labelFor(next, labels)}.`;
	await logEvent(c, conversation.id, userId, action, previous ? String(previous) : '', next ? String(next) : '', comment || summary);
	return conversationForEmail(c, emailId);
}

export async function setPriority(c, userId, emailId, priority) {
	const { conversation } = await requireConversation(c, userId, emailId, 'resolve');
	const next = normalizePriority(priority, conversation.priority);
	if (next === conversation.priority) return conversationForEmail(c, emailId);
	await database(c).prepare(
		`UPDATE mailbox_conversation SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
	).bind(next, conversation.id).run();
	await logEvent(c, conversation.id, userId, 'priority', conversation.priority, next, '');
	return conversationForEmail(c, emailId);
}

export async function addNote(c, userId, emailId, body) {
	const note = cleanText(body, 5000);
	if (!note) throw new BizError('Write the note before saving it.', 400);
	const { conversation } = await requireConversation(c, userId, emailId, 'internal_note');
	await logEvent(c, conversation.id, userId, 'note', '', '', note);
	return database(c).prepare(`
		SELECT ev.*, u.display_name, u.username FROM mailbox_conversation_event ev
		LEFT JOIN user u ON u.user_id = ev.actor_id
		WHERE ev.conversation_id = ? ORDER BY ev.id DESC LIMIT 1
	`).bind(conversation.id).first();
}

// ---------- tags ---------------------------------------------------------

export async function listTags(c) {
	const { results } = await database(c).prepare(
		`SELECT t.id, t.name, t.color,
		   (SELECT COUNT(*) FROM mailbox_conversation_tag ct WHERE ct.tag_id = t.id) AS usage_count
		 FROM mailbox_tag t ORDER BY t.name COLLATE NOCASE`
	).all();
	return results;
}

export async function createTag(c, userId, name, color) {
	const cleanName = cleanText(name, 40);
	if (!cleanName) throw new BizError('Tag name is required.', 400);
	const cleanColor = cleanText(color, 20) || 'slate';
	try {
		const { meta } = await database(c).prepare(
			`INSERT INTO mailbox_tag (name, color, created_by) VALUES (?, ?, ?)`
		).bind(cleanName, cleanColor, userId).run();
		return database(c).prepare(`SELECT * FROM mailbox_tag WHERE id = ?`).bind(meta.last_row_id).first();
	} catch (error) {
		if (String(error?.message || '').includes('UNIQUE')) {
			throw new BizError('A tag with that name already exists.', 400);
		}
		throw error;
	}
}

export async function deleteTag(c, tagId) {
	const id = Number(tagId);
	if (!Number.isSafeInteger(id) || id <= 0) throw new BizError('Invalid tag.', 400);
	await database(c).batch([
		database(c).prepare(`DELETE FROM mailbox_conversation_tag WHERE tag_id = ?`).bind(id),
		database(c).prepare(`DELETE FROM mailbox_tag WHERE id = ?`).bind(id)
	]);
}

export async function setConversationTags(c, userId, emailId, tagIds) {
	const { conversation } = await requireConversation(c, userId, emailId, 'manage_tags');
	const ids = [...new Set((Array.isArray(tagIds) ? tagIds : []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
	if (ids.length) {
		const placeholders = ids.map(() => '?').join(',');
		const existing = await database(c).prepare(
			`SELECT id FROM mailbox_tag WHERE id IN (${placeholders})`
		).bind(...ids).all();
		if ((existing.results || []).length !== ids.length) {
			throw new BizError('One or more tags were not found.', 404);
		}
	}
	const before = await tagList(c, conversation.id);
	const beforeNames = before.map(tag => tag.name);
	await database(c).prepare(`DELETE FROM mailbox_conversation_tag WHERE conversation_id = ?`).bind(conversation.id).run();
	for (const tagId of ids) {
		await database(c).prepare(
			`INSERT OR IGNORE INTO mailbox_conversation_tag (conversation_id, tag_id) VALUES (?, ?)`
		).bind(conversation.id, tagId).run();
	}
	const after = await tagList(c, conversation.id);
	const afterNames = after.map(tag => tag.name);
	const changed = [...afterNames.filter(name => !beforeNames.includes(name)).map(name => `+${name}`),
		...beforeNames.filter(name => !afterNames.includes(name)).map(name => `-${name}`)];
	if (changed.length) {
		await logEvent(c, conversation.id, userId, 'tags', beforeNames.join(','), afterNames.join(','), changed.join(' '));
	}
	return tagList(c, conversation.id);
}

export async function conversationTimeline(c, userId, emailId) {
	const { conversation } = await requireConversation(c, userId, emailId, 'view');
	const events = await database(c).prepare(`
		SELECT ev.*, u.display_name, u.username, u.email
		FROM mailbox_conversation_event ev
		LEFT JOIN user u ON u.user_id = ev.actor_id
		WHERE ev.conversation_id = ?
		ORDER BY ev.create_time ASC, ev.id ASC
	`).bind(conversation.id).all();
	const labels = await memberLabels(c, (events.results || []).map(row => row.actor_id));
	return (events.results || []).map(event => ({
		...event,
		actor_label: event.actor_id ? labelFor(event.actor_id, labels) : 'System'
	}));
}

// ---------- linking a request -------------------------------------------

export async function linkRequest(c, userId, emailId, requestId, summary = '') {
	const { conversation } = await requireConversation(c, userId, emailId, 'view');
	const id = Number(requestId);
	if (!Number.isSafeInteger(id) || id <= 0) throw new BizError('Invalid request.', 400);
	const request = await database(c).prepare(
		`SELECT id, title, status, type, kind FROM internal_requests WHERE id = ? AND is_del = 0`
	).bind(id).first();
	if (!request) throw new BizError('Request not found.', 404);
	const isParticipant = await database(c).prepare(
		`SELECT 1 AS ok FROM internal_requests WHERE id = ? AND is_del = 0 AND (sender_id = ? OR recipient_id = ?)`
	).bind(id, userId, userId).first();
	if (!isParticipant) throw new BizError('You are not part of that request.', 403);

	await database(c).prepare(`
		UPDATE mailbox_conversation SET related_type = 'request', related_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
	`).bind(id, conversation.id).run();
	await logEvent(c, conversation.id, userId, 'link_request', '', String(id), summary || `Linked to request: ${request.title || `#${id}`}.`);
	return conversationForEmail(c, emailId);
}

// ---------- members ------------------------------------------------------

export async function listMembers(c, userId, mailboxId) {
	await assertRoleMail(c, await permService.userPermKeys(c, userId), 'manage');
	// Administering members is either a per-mailbox capability or a company-wide
	// administrator right; assertManageMembers accepts both.
	await assertManageMembers(c, userId, mailboxId);
	const { results } = await database(c).prepare(`
		SELECT m.id, m.user_id, m.permissions, m.status, m.created_at, m.updated_at,
		       u.display_name, u.username, u.email, u.status AS user_status, u.team_id,
		       t.name AS team_name
		FROM mailbox_member m
		JOIN user u ON u.user_id = m.user_id
		LEFT JOIN team t ON t.team_id = u.team_id
		WHERE m.mailbox_id = ?
		ORDER BY u.display_name COLLATE NOCASE
	`).bind(mailboxId).all();
	return results;
}

export async function addMember(c, userId, mailboxId, targetUserId, permissions) {
	await assertRoleMail(c, await permService.userPermKeys(c, userId), 'manage');
	const access = await assertManageMembers(c, userId, mailboxId);
	// Adding a member must not require them to already be a member: any active
	// account may be granted access here.
	const target = await assertUserActive(c, targetUserId);
	const existing = await findMembership(c, target.userId, mailboxId);
	const wanted = normalizeActionList(permissions);
	if (existing) {
		await database(c).prepare(`
			UPDATE mailbox_member SET permissions = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?
		`).bind(wanted.join(','), existing.id).run();
		await database(c).prepare(`
			INSERT INTO mailbox_member_audit (mailbox_id, actor_id, target_id, action, detail, create_time)
			VALUES (?, ?, ?, 'permission', ?, CURRENT_TIMESTAMP)
		`).bind(mailboxId, userId, target.userId, wanted.join(',')).run().catch(() => {});
		return findMembership(c, target.userId, mailboxId);
	}
	const { meta } = await database(c).prepare(`
		INSERT INTO mailbox_member (mailbox_id, user_id, permissions, status, created_by, created_at, updated_at)
		VALUES (?, ?, ?, 'active', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`).bind(mailboxId, target.userId, wanted.join(','), userId).run();
	await database(c).prepare(`
		INSERT INTO mailbox_member_audit (mailbox_id, actor_id, target_id, action, detail, create_time)
		VALUES (?, ?, ?, 'add', ?, CURRENT_TIMESTAMP)
	`).bind(mailboxId, userId, target.userId, wanted.join(',')).run().catch(() => {});
	return database(c).prepare(`SELECT * FROM mailbox_member WHERE id = ?`).bind(meta.last_row_id).first();
}

export async function updateMemberPermissions(c, userId, mailboxId, memberUserId, permissions) {
	await assertRoleMail(c, await permService.userPermKeys(c, userId), 'manage');
	await assertManageMembers(c, userId, mailboxId);
	const membership = await findMembership(c, memberUserId, mailboxId);
	if (!membership) throw new BizError('That member is not in this mailbox.', 404);
	const wanted = normalizeActionList(permissions);
	await database(c).prepare(`
		UPDATE mailbox_member SET permissions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
	`).bind(wanted.join(','), membership.id).run();
	await database(c).prepare(`
		INSERT INTO mailbox_member_audit (mailbox_id, actor_id, target_id, action, detail, create_time)
		VALUES (?, ?, ?, 'permission', ?, CURRENT_TIMESTAMP)
	`).bind(mailboxId, userId, memberUserId, wanted.join(',')).run().catch(() => {});
	return findMembership(c, memberUserId, mailboxId);
}

export async function removeMember(c, userId, mailboxId, memberUserId) {
	await assertRoleMail(c, await permService.userPermKeys(c, userId), 'manage');
	await assertManageMembers(c, userId, mailboxId);
	const membership = await findMembership(c, memberUserId, mailboxId);
	if (!membership) throw new BizError('That member is not in this mailbox.', 404);
	await database(c).prepare(`DELETE FROM mailbox_member WHERE id = ?`).bind(membership.id).run();
	await database(c).prepare(`
		INSERT INTO mailbox_member_audit (mailbox_id, actor_id, target_id, action, detail, create_time)
		VALUES (?, ?, ?, 'remove', '', CURRENT_TIMESTAMP)
	`).bind(mailboxId, userId, memberUserId).run().catch(() => {});
	return { removed: Number(memberUserId) };
}

export async function memberAudit(c, mailboxId) {
	const { results } = await database(c).prepare(`
		SELECT ma.*, u.display_name, u.username FROM mailbox_member_audit ma
		LEFT JOIN user u ON u.user_id = ma.target_id
		WHERE ma.mailbox_id = ? ORDER BY ma.id DESC LIMIT 100
	`).bind(mailboxId).all();
	return results;
}

export async function memberOptions(c, mailboxId) {
	// Only members who actually hold view access are valid assignment targets,
	// and only active accounts: a suspended member must never receive work.
	const { results } = await database(c).prepare(`
		SELECT u.user_id, u.display_name, u.username, u.email, u.status AS user_status, u.team_id,
		       t.name AS team_name, m.permissions
		FROM mailbox_member m
		JOIN user u ON u.user_id = m.user_id
		LEFT JOIN team t ON t.team_id = u.team_id
		WHERE m.mailbox_id = ? AND m.status = 'active' AND COALESCE(u.is_del, 0) = 0
		ORDER BY u.display_name COLLATE NOCASE
	`).bind(mailboxId).all();
	return results;
}

export default {
	MAILBOX_ACTIONS,
	isSharedRow,
	grantAdminMembership,
	listForMember,
	assertAccess,
	assertManageMembers,
	listSharedMailboxes,
	deleteSharedMailbox,
	assertRoleMail,
	findMembership,
	setLastMailbox,
	getLastMailbox,
	listConversations,
	mailboxSummary,
	conversationDetail,
	conversationForEmail,
	registerIncoming,
	registerOutgoing,
	registerMessage,
	resolve,
	reopen,
	assign,
	setPriority,
	addNote,
	listTags,
	createTag,
	deleteTag,
	setConversationTags,
	conversationTimeline,
	linkRequest,
	listMembers,
	addMember,
	updateMemberPermissions,
	removeMember,
	memberAudit,
	memberOptions,
};

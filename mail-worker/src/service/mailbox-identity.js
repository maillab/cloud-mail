import BizError from '../error/biz-error';

// Mailbox identity rules in one place, because three places need the same
// answer: the switcher (what to show), the mail guard (what a member may open)
// and the sender check (who an outgoing message may claim to come from).

export const MAILBOX_TYPES = ['personal', 'shared'];
export const MAILBOX_STATUSES = ['active', 'disabled'];
export const HEALTH_STATES = ['unknown', 'connected', 'needs_attention', 'authentication_failed', 'inbound_unavailable', 'outbound_unavailable', 'disabled'];

export function isSharedMailbox(type) {
	return String(type || '').trim().toLowerCase() === 'shared';
}

export function isPersonalMailbox(type) {
	return !isSharedMailbox(type);
}

export function normalizeMailboxType(value) {
	return MAILBOX_TYPES.includes(String(value ?? '').trim().toLowerCase())
		? String(value).trim().toLowerCase()
		: 'personal';
}

export function normalizeMailboxStatus(value) {
	return MAILBOX_STATUSES.includes(String(value ?? '').trim().toLowerCase())
		? String(value).trim().toLowerCase()
		: 'active';
}

export function normalizeHealthState(value) {
	return HEALTH_STATES.includes(String(value ?? '').trim().toLowerCase())
		? String(value).trim().toLowerCase()
		: 'unknown';
}

// The address a message may legitimately be sent from. Derived from stored
// records only: a client-supplied sender is never trusted, otherwise anyone
// with send rights could send as any colleague.
export async function assertSenderIdentity(c, accountRow, userId, requestedEmail) {
	if (!accountRow) throw new BizError('Sender mailbox not found.', 404);
	const wanted = String(requestedEmail || accountRow.email || '').trim().toLowerCase();
	if (!wanted) throw new BizError('A sender address is required.', 400);
	if (wanted !== String(accountRow.email || '').trim().toLowerCase()) {
		throw new BizError('That sender address is not available to you.', 403);
	}
	return accountRow;
}

export default {
	MAILBOX_TYPES,
	MAILBOX_STATUSES,
	HEALTH_STATES,
	isSharedMailbox,
	isPersonalMailbox,
	normalizeMailboxType,
	normalizeMailboxStatus,
	normalizeHealthState,
	assertSenderIdentity,
};
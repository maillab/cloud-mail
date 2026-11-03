// Cloud Mail MCP endpoint (Streamable HTTP, stateless, dependency-free).
//
// Mounted by mail-worker/src/index.js on POST /mcp/ (and /mcp), BEFORE the
// static-assets fallback, so it never collides with the Vue SPA.
//
// Authentication: every call must carry `Authorization: Bearer <key>` where
// <key> equals the Worker secret/env var MCP_AUTH_KEY. The comparison is
// timing-safe. If MCP_AUTH_KEY is unset, EVERY call is rejected with a clear
// configuration error: the endpoint is never open.
//
// Write gating: read tools are always listed. Write tools are listed and
// callable ONLY when env.MCP_WRITE_ENABLED === 'true'. Otherwise they do not
// appear in tools/list at all.
//
// Mail access: tools act as the instance admin user (env.admin) resolved via
// userService.selectByEmail. There is no per-caller mailbox login here; the
// bearer key is the only credential, so guard it like an admin password.
//
// Privacy: this module logs nothing (no keys, tokens, subjects, or bodies).
// Tool failures are surfaced as MCP isError content, never with mail content.
//
// No new npm dependencies: only the existing service modules are reused, and
// services only need a `{ env }` context object (orm() reads c.env.db).

import emailService from '../service/email-service';
import accountService from '../service/account-service';
import userService from '../service/user-service';

const SERVER_NAME = 'cloudmail-mcp';
const SERVER_VERSION = '0.1.0';
const SUPPORTED_PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18'];
const DEFAULT_PROTOCOL_VERSION = '2024-11-05';

const ERR_PARSE = -32700;
const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INVALID_PARAMS = -32602;
const ERR_INTERNAL = -32603;
const ERR_NOT_CONFIGURED = -32000;
const ERR_UNAUTHORIZED = -32001;

function corsHeaders() {
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
	};
}

function jsonResponse(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...corsHeaders() },
	});
}

function rpcError(id, code, message, status = 200) {
	return jsonResponse({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, status);
}

function rpcResult(id, result) {
	return jsonResponse({ jsonrpc: '2.0', id, result });
}

// Constant-time string comparison (no node:crypto dependency, Workers-safe).
function timingSafeEqual(a, b) {
	const sa = String(a);
	const sb = String(b);
	const len = Math.max(sa.length, sb.length);
	let diff = sa.length ^ sb.length;
	for (let i = 0; i < len; i++) {
		const ca = i < sa.length ? sa.charCodeAt(i) : 0;
		const cb = i < sb.length ? sb.charCodeAt(i) : 0;
		diff |= ca ^ cb;
	}
	return diff === 0;
}

function isWriteEnabled(env) {
	return env.MCP_WRITE_ENABLED === 'true';
}

function textResult(data) {
	return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function errorResult(message) {
	return { content: [{ type: 'text', text: message }], isError: true };
}

function requireNumber(value, name) {
	const n = Number(value);
	if (value === undefined || value === null || value === '' || Number.isNaN(n)) {
		throw new Error(`missing or invalid required parameter: ${name}`);
	}
	return n;
}

function optionalNumber(value, fallback) {
	const n = Number(value);
	return value === undefined || value === null || value === '' || Number.isNaN(n) ? fallback : n;
}

// Resolve the admin user id for tool calls. Throws on misconfiguration;
// callers surface it as an isError tool result, never as a fallback identity.
async function resolveAdminUserId(ctx) {
	const adminEmail = ctx.env.admin;
	if (!adminEmail) {
		throw new Error('MCP is not configured: admin user is not set');
	}
	const row = await userService.selectByEmail(ctx, adminEmail);
	if (!row) {
		throw new Error('MCP is not configured: admin user not found');
	}
	return row.userId;
}

const READ_TOOLS = [
	{
		name: 'accounts_list',
		description: 'List the admin mailbox accounts (id, email, name).',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
	},
	{
		name: 'mail_list',
		description: 'List mails of one account. type: 0 = inbox, 1 = sent. size max 50. emailId is a cursor for paging (descending). full=1 returns full content plus attachment metadata, full=0 returns a brief summary.',
		inputSchema: {
			type: 'object',
			properties: {
				accountId: { type: 'number', description: 'Mailbox account id (required, see accounts_list).' },
				type: { type: 'number', description: '0 = inbox (default), 1 = sent.' },
				size: { type: 'number', description: 'Page size, default 20, max 50.' },
				emailId: { type: 'number', description: 'Cursor: return mails with emailId smaller than this (descending order).' },
				full: { type: 'number', description: '0 = brief (default), 1 = full content.' },
			},
			required: ['accountId'],
			additionalProperties: false,
		},
	},
	{
		name: 'mail_search',
		description: 'Search mails across all accounts (admin view). name, subject, accountEmail and userEmail are case-insensitive PREFIX filters. type: receive (default), send, delete, noone.',
		inputSchema: {
			type: 'object',
			properties: {
				name: { type: 'string', description: 'Sender name prefix.' },
				subject: { type: 'string', description: 'Subject prefix.' },
				accountEmail: { type: 'string', description: 'Mailbox address prefix (matches sender or recipient address).' },
				userEmail: { type: 'string', description: 'Account owner email prefix.' },
				type: { type: 'string', enum: ['receive', 'send', 'delete', 'noone'] },
				size: { type: 'number', description: 'Page size, default 20, max 50.' },
				emailId: { type: 'number', description: 'Cursor for paging (descending order).' },
			},
			additionalProperties: false,
		},
	},
	{
		name: 'mail_get',
		description: 'Fetch one mail in full (content plus attachment metadata) by emailId. Implemented as a bounded scan: inbox then sent, newest first, up to 5 pages of 50 per mailbox per account, 20 pages total.',
		inputSchema: {
			type: 'object',
			properties: {
				emailId: { type: 'number', description: 'Mail id (required).' },
			},
			required: ['emailId'],
			additionalProperties: false,
		},
	},
];

const WRITE_TOOLS = [
	{
		name: 'mail_send',
		description: 'Send a new mail. receiveEmail is a list of recipient addresses. At least one of content (HTML) or text should be provided. attachments, if given, must use the same shape the mail web API expects; omit when unsure.',
		inputSchema: {
			type: 'object',
			properties: {
				accountId: { type: 'number', description: 'Sender account id (required).' },
				receiveEmail: { type: 'array', items: { type: 'string' }, description: 'Recipient addresses (required, non-empty).' },
				subject: { type: 'string', description: 'Subject (required).' },
				content: { type: 'string', description: 'HTML body.' },
				text: { type: 'string', description: 'Plain-text body.' },
				name: { type: 'string', description: 'Sender display name (defaults to the account name part).' },
				attachments: { type: 'array', description: 'Optional attachments in web-API shape.' },
			},
			required: ['accountId', 'receiveEmail', 'subject'],
			additionalProperties: false,
		},
	},
	{
		name: 'mail_reply',
		description: 'Reply to a mail. Recipients default to the original sender; subject defaults to "Re: <original subject>". At least one of content or text is required.',
		inputSchema: {
			type: 'object',
			properties: {
				accountId: { type: 'number', description: 'Sender account id (required).' },
				emailId: { type: 'number', description: 'Original mail id (required).' },
				receiveEmail: { type: 'array', items: { type: 'string' }, description: 'Recipients; defaults to the original sender.' },
				subject: { type: 'string', description: 'Subject; defaults to "Re: <original subject>".' },
				content: { type: 'string', description: 'HTML body.' },
				text: { type: 'string', description: 'Plain-text body.' },
			},
			required: ['accountId', 'emailId'],
			additionalProperties: false,
		},
	},
	{
		name: 'mail_forward',
		description: 'Forward a mail. Subject defaults to "Fwd: <original subject>"; content/text default to the original mail body.',
		inputSchema: {
			type: 'object',
			properties: {
				accountId: { type: 'number', description: 'Sender account id (required).' },
				emailId: { type: 'number', description: 'Original mail id (required).' },
				receiveEmail: { type: 'array', items: { type: 'string' }, description: 'Recipients (required, non-empty).' },
				subject: { type: 'string', description: 'Subject; defaults to "Fwd: <original subject>".' },
				content: { type: 'string', description: 'HTML body; defaults to the original content.' },
				text: { type: 'string', description: 'Plain-text body; defaults to the original text.' },
			},
			required: ['accountId', 'emailId', 'receiveEmail'],
			additionalProperties: false,
		},
	},
	{
		name: 'mail_delete',
		description: 'Delete mails (soft delete by default; permanent only when the instance has sync-delete enabled). emailIds may be a comma-separated string or a list of ids.',
		inputSchema: {
			type: 'object',
			properties: {
				emailIds: { description: 'Comma-separated ids or a list of ids (required).' },
			},
			required: ['emailIds'],
			additionalProperties: false,
		},
	},
	{
		name: 'account_add',
		description: 'Add a mailbox address for the admin user. The address domain must be configured on the instance and prefix rules apply; if the instance requires a verification token, the call fails with an error instead of bypassing it.',
		inputSchema: {
			type: 'object',
			properties: {
				email: { type: 'string', description: 'New mailbox address (required).' },
			},
			required: ['email'],
			additionalProperties: false,
		},
	},
	{
		name: 'account_delete',
		description: 'Delete a mailbox address. The login user main mailbox cannot be deleted (the service refuses it).',
		inputSchema: {
			type: 'object',
			properties: {
				accountId: { type: 'number', description: 'Account id (required).' },
			},
			required: ['accountId'],
			additionalProperties: false,
		},
	},
];

function visibleTools(env) {
	return isWriteEnabled(env) ? [...READ_TOOLS, ...WRITE_TOOLS] : READ_TOOLS;
}

function normalizeEmailIds(value) {
	if (Array.isArray(value)) {
		const ids = value.map(Number).filter((n) => !Number.isNaN(n));
		if (!ids.length) throw new Error('missing or invalid required parameter: emailIds');
		return ids.join(',');
	}
	if (typeof value === 'string' && value.trim()) return value;
	if (typeof value === 'number' && !Number.isNaN(value)) return String(value);
	throw new Error('missing or invalid required parameter: emailIds');
}

async function callTool(ctx, name, args = {}) {
	const userId = await resolveAdminUserId(ctx);
	switch (name) {
		case 'accounts_list': {
			const rows = await accountService.list(ctx, { size: 30 }, userId);
			return textResult(rows.map((r) => ({ accountId: r.accountId, email: r.email, name: r.name })));
		}
		case 'mail_list': {
			const accountId = requireNumber(args.accountId, 'accountId');
			const data = await emailService.list(ctx, {
				accountId,
				type: optionalNumber(args.type, 0),
				size: Math.min(optionalNumber(args.size, 20), 50),
				emailId: optionalNumber(args.emailId, 0),
				full: optionalNumber(args.full, 0),
			}, userId);
			return textResult(data);
		}
		case 'mail_search': {
			if (args.type !== undefined && !['receive', 'send', 'delete', 'noone'].includes(args.type)) {
				throw new Error('invalid parameter: type must be receive, send, delete or noone');
			}
			const data = await emailService.allList(ctx, {
				name: args.name,
				subject: args.subject,
				accountEmail: args.accountEmail,
				userEmail: args.userEmail,
				type: args.type,
				size: Math.min(optionalNumber(args.size, 20), 50),
				emailId: optionalNumber(args.emailId, 0),
			});
			return textResult(data);
		}
		case 'mail_get': {
			const emailId = requireNumber(args.emailId, 'emailId');
			const accounts = await accountService.list(ctx, { size: 30 }, userId);
			let pagesUsed = 0;
			for (const account of accounts) {
				for (const type of [0, 1]) {
					let cursor = 0;
					for (let page = 0; page < 5; page++) {
						if (pagesUsed >= 20) break;
						pagesUsed++;
						const data = await emailService.list(ctx, {
							accountId: account.accountId,
							type,
							size: 50,
							emailId: cursor,
							full: 1,
						}, userId);
						const found = data.list.find((row) => row.emailId === emailId);
						if (found) return textResult(found);
						if (!data.list.length) break;
						cursor = data.list[data.list.length - 1].emailId;
					}
				}
			}
			return errorResult(`mail not found: ${emailId}`);
		}
		case 'mail_send': {
			const accountId = requireNumber(args.accountId, 'accountId');
			if (!Array.isArray(args.receiveEmail) || !args.receiveEmail.length) {
				throw new Error('missing or invalid required parameter: receiveEmail');
			}
			if (!args.subject) throw new Error('missing or invalid required parameter: subject');
			const data = await emailService.send(ctx, {
				accountId,
				receiveEmail: args.receiveEmail,
				subject: args.subject,
				content: args.content || '',
				text: args.text || '',
				name: args.name,
				sendType: '',
				attachments: Array.isArray(args.attachments) ? args.attachments : [],
			}, userId);
			return textResult(data);
		}
		case 'mail_reply': {
			const accountId = requireNumber(args.accountId, 'accountId');
			const emailId = requireNumber(args.emailId, 'emailId');
			if (!args.content && !args.text) {
				throw new Error('at least one of content or text is required');
			}
			const original = await emailService.selectById(ctx, emailId);
			if (!original) throw new Error(`mail not found: ${emailId}`);
			const receiveEmail = Array.isArray(args.receiveEmail) && args.receiveEmail.length
				? args.receiveEmail
				: [original.senderEmail || original.sendEmail].filter(Boolean);
			if (!receiveEmail.length) throw new Error('cannot determine reply recipient; pass receiveEmail');
			const data = await emailService.send(ctx, {
				accountId,
				emailId,
				receiveEmail,
				subject: args.subject || `Re: ${original.subject || ''}`,
				content: args.content || '',
				text: args.text || '',
				sendType: 'reply',
				attachments: [],
			}, userId);
			return textResult(data);
		}
		case 'mail_forward': {
			const accountId = requireNumber(args.accountId, 'accountId');
			const emailId = requireNumber(args.emailId, 'emailId');
			if (!Array.isArray(args.receiveEmail) || !args.receiveEmail.length) {
				throw new Error('missing or invalid required parameter: receiveEmail');
			}
			const original = await emailService.selectById(ctx, emailId);
			if (!original) throw new Error(`mail not found: ${emailId}`);
			const data = await emailService.send(ctx, {
				accountId,
				emailId,
				receiveEmail: args.receiveEmail,
				subject: args.subject || `Fwd: ${original.subject || ''}`,
				content: args.content !== undefined ? args.content : (original.content || ''),
				text: args.text !== undefined ? args.text : (original.text || ''),
				sendType: 'forward',
				attachments: [],
			}, userId);
			return textResult(data);
		}
		case 'mail_delete': {
			const emailIds = normalizeEmailIds(args.emailIds);
			await emailService.delete(ctx, { emailIds }, userId);
			return textResult({ deleted: emailIds });
		}
		case 'account_add': {
			if (!args.email) throw new Error('missing or invalid required parameter: email');
			const row = await accountService.add(ctx, { email: args.email }, userId);
			return textResult({ accountId: row.accountId, email: row.email, name: row.name, addVerifyOpen: row.addVerifyOpen });
		}
		case 'account_delete': {
			const accountId = requireNumber(args.accountId, 'accountId');
			await accountService.delete(ctx, { accountId }, userId);
			return textResult({ deleted: accountId });
		}
		default:
			throw new Error(`unknown tool: ${name}`);
	}
}

function negotiateProtocolVersion(requested) {
	if (typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
		return requested;
	}
	if (typeof requested === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(requested)) {
		return requested;
	}
	return DEFAULT_PROTOCOL_VERSION;
}

// Stateless Streamable HTTP entry point. `req` is the original Request,
// `env` is the Worker bindings object. Returns a Response.
export async function handleMcpRequest(req, env) {
	if (req.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: corsHeaders() });
	}
	if (req.method !== 'POST') {
		return jsonResponse({ jsonrpc: '2.0', id: null, error: { code: ERR_INVALID_REQUEST, message: 'only POST is supported' } }, 405);
	}

	const expectedKey = env.MCP_AUTH_KEY;
	if (!expectedKey) {
		return rpcError(null, ERR_NOT_CONFIGURED, 'MCP is not configured: MCP_AUTH_KEY is not set', 500);
	}
	const authorization = req.headers.get('Authorization') || '';
	if (!timingSafeEqual(authorization, `Bearer ${expectedKey}`)) {
		return rpcError(null, ERR_UNAUTHORIZED, 'unauthorized', 401);
	}

	let body;
	try {
		body = await req.json();
	} catch {
		return rpcError(null, ERR_PARSE, 'parse error');
	}
	if (!body || typeof body !== 'object' || typeof body.method !== 'string') {
		return rpcError(body && body.id !== undefined ? body.id : null, ERR_INVALID_REQUEST, 'invalid request');
	}

	// Notifications carry no id: acknowledge, do not answer.
	if (body.id === undefined) {
		return new Response(null, { status: 202, headers: corsHeaders() });
	}

	const ctx = { env };
	try {
		switch (body.method) {
			case 'initialize': {
				const params = body.params || {};
				return rpcResult(body.id, {
					protocolVersion: negotiateProtocolVersion(params.protocolVersion),
					capabilities: { tools: {} },
					serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
				});
			}
			case 'ping':
				return rpcResult(body.id, {});
			case 'tools/list':
				return rpcResult(body.id, { tools: visibleTools(env) });
			case 'tools/call': {
				const params = body.params || {};
				if (!params.name) {
					return rpcError(body.id, ERR_INVALID_PARAMS, 'invalid params: name is required');
				}
				const allowed = visibleTools(env).some((t) => t.name === params.name);
				if (!allowed) {
					return rpcError(body.id, ERR_INVALID_PARAMS, `tool not available: ${params.name}`);
				}
				try {
					const result = await callTool(ctx, params.name, params.arguments || {});
					return rpcResult(body.id, result);
				} catch (err) {
					return rpcResult(body.id, errorResult(err && err.message ? err.message : 'tool failed'));
				}
			}
			default:
				return rpcError(body.id, ERR_METHOD_NOT_FOUND, `method not found: ${body.method}`);
		}
	} catch (err) {
		return rpcError(body.id, ERR_INTERNAL, err && err.message ? err.message : 'internal error');
	}
}

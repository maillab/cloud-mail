import BizError from '../error/biz-error';
import dayjs from 'dayjs';

// The curated connection catalogue.
//
// This is deliberately a fixed list, not a free-form "new integration" form. A
// connection that XPass has not actually implemented is worse than no entry at
// all: it teaches people to expect a flow that does not exist.
//
// `secrets: true` means the provider needs a credential. The value is stored
// encrypted and never returned to the browser; only `configured` is exposed.
const CATALOGUE = [
	{
		provider: 'whatsapp',
		name: 'WhatsApp Business',
		group: 'Comms',
		purpose: 'One official XPass number that authorised team members handle together from HQ.',
		statusLabel: 'Shared team inbox',
		secrets: true,
		secretLabel: 'Provider access token',
		secretHint: 'Used only to send and receive on the company number. Never shown again after saving.',
		identityLabel: 'Company WhatsApp number',
		identityPlaceholder: '+254 7XX XXX XXX',
		docs: 'The company number is connected once by an administrator. Team members never sign in to WhatsApp themselves.',
		permissions: ['whatsapp:query']
	},
	{
		provider: 'ai_provider',
		name: 'XPASS ONE Provider',
		group: 'Intelligence',
		purpose: 'Powers XPASS ONE: page explanations, drafting and summaries of data you can already see.',
		statusLabel: 'Company assistant',
		secrets: true,
		secretLabel: 'Provider API key',
		secretHint: 'Stored encrypted. Requests are made from the worker, never from the browser.',
		identityLabel: 'Model or account label',
		identityPlaceholder: 'e.g. company workspace',
		docs: 'XPASS ONE only ever sees records the signed-in member can already access.',
		permissions: ['ai:use']
	},
	{
		provider: 'email_forwarding',
		name: 'Email notifications',
		group: 'Comms',
		purpose: 'Email a member when something assigned to them needs attention, with a link back into HQ.',
		statusLabel: 'Notification delivery',
		secrets: false,
		identityLabel: 'Sending domain',
		identityPlaceholder: 'getxpass.com',
		docs: 'Notifications point back to HQ. They are never a reply channel to customers.',
		permissions: []
	}
];

function now() {
	return dayjs().format('YYYY-MM-DD HH:mm:ss');
}

const connectionService = {

	catalogue() {
		return CATALOGUE;
	},

	find(provider) {
		return CATALOGUE.find(item => item.provider === provider) || null;
	},

	// Public shape. No secret ever leaves this function.
	toPublic(def, row) {
		const configured = Boolean(row?.secret_ref) || Boolean(row?.identity);
		return {
			provider: def.provider,
			name: def.name,
			group: def.group,
			purpose: def.purpose,
			statusLabel: def.statusLabel,
			requiresSecret: Boolean(def.secrets),
			secretConfigured: Boolean(row?.secret_ref),
			identityConfigured: Boolean(row?.identity),
			identityLabel: def.identityLabel,
			identityPlaceholder: def.identityPlaceholder,
			secretLabel: def.secretLabel || '',
			secretHint: def.secretHint || '',
			help: def.docs,
			permissions: def.permissions || [],
			identity: row?.identity || '',
			status: row?.status || 'not_configured',
			lastCheckedAt: row?.last_checked_at || null,
			lastError: row?.last_error || '',
			configuredBy: row?.configured_by || null,
			updatedAt: row?.update_time || null,
			configured
		};
	},

	async ensureRow(c, provider) {
		const def = this.find(provider);
		if (!def) {
			throw new BizError('That connection is not available.', 404);
		}
		await c.env.db.prepare(
			`INSERT OR IGNORE INTO connection (provider, status) VALUES (?, 'not_configured')`
		).bind(provider).run();
		const row = await c.env.db.prepare(`SELECT * FROM connection WHERE provider = ?`).bind(provider).first();
		return { def, row };
	},

	async list(c) {
		const { results } = await c.env.db.prepare(`SELECT * FROM connection`).all();
		const byProvider = new Map((results || []).map(row => [row.provider, row]));
		return CATALOGUE.map(def => this.toPublic(def, byProvider.get(def.provider)));
	},

	async get(c, provider) {
		const { def, row } = await this.ensureRow(c, provider);
		return this.toPublic(def, row);
	},

	async save(c, provider, body, actorId, secretService) {
		const { def, row } = await this.ensureRow(c, provider);

		const patch = { update_time: now() };

		if (body.identity !== undefined) {
			patch.identity = String(body.identity || '').trim().slice(0, 200);
		}

		if (body.secret !== undefined) {
			if (def.secrets && body.secret) {
				// Encrypted at rest; the plaintext is dropped immediately after.
				patch.secret_ref = await secretService.encrypt(c, String(body.secret));
				patch.status = 'configured';
				patch.last_error = '';
			} else if (body.secret === '' || body.secret === null) {
				patch.secret_ref = '';
				if (!patch.identity) {
					patch.status = 'not_configured';
				}
			}
		}

		if (body.identity && !row.secret_ref && def.secrets && patch.secret_ref === undefined) {
			// An identity without a credential is half-configured. Say so
			// instead of reporting success.
			patch.status = 'not_configured';
			patch.last_error = 'Add the credential to finish connecting.';
		} else if (patch.secret_ref || row.secret_ref) {
			patch.status = 'configured';
		}

		patch.configured_by = actorId;

		const columns = Object.keys(patch);
		await c.env.db.prepare(
			`UPDATE connection SET ${columns.map(col => `${col} = ?`).join(', ')} WHERE provider = ?`
		).bind(...columns.map(col => patch[col]), provider).run();

		return this.get(c, provider);
	},

	async disconnect(c, provider, actorId) {
		const { def } = await this.ensureRow(c, provider);
		await c.env.db.prepare(
			`UPDATE connection SET status = 'not_configured', secret_ref = '', identity = '',
				last_error = '', last_checked_at = ?, update_time = ?, configured_by = ?
			 WHERE provider = ?`
		).bind(now(), now(), actorId, provider).run();
		return this.toPublic(def, null);
	},

	// Mark a provider as connected after a real verification step (an OTP that
	// the provider accepted, an OAuth callback, a health probe). Never called
	// just because the form was submitted.
	async markConnected(c, provider, identity) {
		await c.env.db.prepare(
			`UPDATE connection SET status = 'connected', identity = ?, last_checked_at = ?,
				last_error = '', update_time = ? WHERE provider = ?`
		).bind(identity || '', now(), now(), provider).run();
	},

	async markError(c, provider, message) {
		await c.env.db.prepare(
			`UPDATE connection SET status = 'error', last_error = ?, last_checked_at = ?, update_time = ?
			 WHERE provider = ?`
		).bind(String(message || '').slice(0, 400), now(), now(), provider).run();
	},

	async overview(c) {
		const list = await this.list(c);
		return {
			list,
			configuredCount: list.filter(item => item.configured).length,
			totalCount: list.length
		};
	}
};

export default connectionService;
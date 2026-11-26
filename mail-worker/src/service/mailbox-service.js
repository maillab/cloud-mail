import BizError from '../error/biz-error';

const SYSTEM_FOLDERS = new Set(['inbox', 'sent', 'archive', 'spam', 'trash']);
const CATEGORIES = new Set(['primary', 'newsletter', 'notification']);
const MAX_MESSAGE_IDS = 95;

function database(c) {
	return c.env.db;
}

function validateName(value, label) {
	const name = typeof value === 'string' ? value.trim() : '';
	if (!name || name.length > 60) {
		throw new BizError(`${label} must be between 1 and 60 characters.`, 400);
	}
	return name;
}

function messageIds(value) {
	const ids = Array.isArray(value) ? value : [];
	const normalized = [...new Set(ids.map(Number))];
	if (!normalized.length || normalized.length > MAX_MESSAGE_IDS
		|| normalized.some(id => !Number.isSafeInteger(id) || id <= 0)) {
		throw new BizError(`Select between 1 and ${MAX_MESSAGE_IDS} messages.`, 400);
	}
	return normalized;
}

async function ownedMessageIds(c, ids, userId) {
	const placeholders = ids.map(() => '?').join(',');
	const { results } = await database(c).prepare(
		`SELECT email_id FROM email WHERE user_id = ? AND email_id IN (${placeholders})`
	).bind(userId, ...ids).all();
	if (results.length !== ids.length) {
		throw new BizError('One or more messages were not found.', 404);
	}
	return ids;
}

const mailboxService = {
	async listFolders(c, userId) {
		const { results } = await database(c).prepare(`
			SELECT f.folder_id AS folderId, f.name,
				COUNT(CASE WHEN e.type = 0 AND e.unread = 0 THEN 1 END) AS unreadCount
			FROM mail_folder f
			LEFT JOIN email_folder ef ON ef.folder_id = f.folder_id AND ef.user_id = f.user_id
			LEFT JOIN email e ON e.email_id = ef.email_id AND e.user_id = f.user_id
				AND e.is_del = 0 AND e.mailbox_folder != 'trash'
			WHERE f.user_id = ?
			GROUP BY f.folder_id
			ORDER BY f.name COLLATE NOCASE
		`).bind(userId).all();
		return results;
	},

	async counts(c, userId) {
		const row = await database(c).prepare(`
			SELECT
				SUM(CASE WHEN type = 0 AND mailbox_folder = 'inbox'
					AND (snoozed_until IS NULL OR julianday(snoozed_until) <= julianday('now'))
					AND unread = 0 AND is_del = 0 THEN 1 ELSE 0 END) AS inbox,
				SUM(CASE WHEN type = 1 AND mailbox_folder = 'sent' AND is_del = 0 THEN 1 ELSE 0 END) AS sent,
				SUM(CASE WHEN type = 0 AND category = 'newsletter' AND unread = 0 AND is_del = 0 AND mailbox_folder != 'trash' THEN 1 ELSE 0 END) AS newsletter,
				SUM(CASE WHEN type = 0 AND category = 'notification' AND unread = 0 AND is_del = 0 AND mailbox_folder != 'trash' THEN 1 ELSE 0 END) AS notification,
				SUM(CASE WHEN type = 0 AND unread = 0 AND is_del = 0 THEN 1 ELSE 0 END) AS unread,
				SUM(CASE WHEN mailbox_folder = 'archive' AND is_del = 0 THEN 1 ELSE 0 END) AS archive,
				SUM(CASE WHEN mailbox_folder = 'spam' AND is_del = 0 THEN 1 ELSE 0 END) AS spam,
				SUM(CASE WHEN mailbox_folder = 'trash' THEN 1 ELSE 0 END) AS trash,
				SUM(CASE WHEN snoozed_until IS NOT NULL AND julianday(snoozed_until) > julianday('now') AND is_del = 0 THEN 1 ELSE 0 END) AS snoozed,
				SUM(CASE WHEN type = 1 AND status IN (5, 6) AND is_del = 0 THEN 1 ELSE 0 END) AS outbox
			FROM email WHERE user_id = ?
		`).bind(userId).first();
		return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key, Number(value) || 0]));
	},

	async createFolder(c, userId, params) {
		const name = validateName(params?.name, 'Folder name');
		const result = await database(c).prepare(
			'INSERT INTO mail_folder (user_id, name) VALUES (?, ?) RETURNING folder_id AS folderId, name'
		).bind(userId, name).first();
		return result;
	},

	async deleteFolder(c, userId, folderId) {
		const id = Number(folderId);
		if (!Number.isSafeInteger(id) || id <= 0) throw new BizError('Invalid folder.', 400);
		await database(c).batch([
			database(c).prepare(`UPDATE email SET mailbox_folder = 'inbox'
				WHERE user_id = ? AND mailbox_folder = 'custom'
					AND email_id IN (SELECT email_id FROM email_folder WHERE user_id = ? AND folder_id = ?)
			`).bind(userId, userId, id),
			database(c).prepare('DELETE FROM email_folder WHERE user_id = ? AND folder_id = ?').bind(userId, id),
			database(c).prepare('DELETE FROM mail_folder WHERE user_id = ? AND folder_id = ?').bind(userId, id)
		]);
	},

	async moveMessages(c, userId, params) {
		const ids = await ownedMessageIds(c, messageIds(params?.emailIds), userId);
		const destination = params?.destination;
		const db = database(c);
		const placeholders = ids.map(() => '?').join(',');
		const removeCustomFolders = db.prepare(
			`DELETE FROM email_folder WHERE user_id = ? AND email_id IN (${placeholders})`
		).bind(userId, ...ids);

		if (destination === 'snoozed') {
			const snoozedUntil = new Date(params?.until);
			if (!params?.until || Number.isNaN(snoozedUntil.getTime()) || snoozedUntil <= new Date()) {
				throw new BizError('Choose a future snooze time.', 400);
			}
			await db.batch([
				removeCustomFolders,
				db.prepare(`UPDATE email SET mailbox_folder = 'inbox', snoozed_until = ?, is_del = 0
					WHERE user_id = ? AND email_id IN (${placeholders})`)
					.bind(snoozedUntil.toISOString(), userId, ...ids)
			]);
			return;
		}

		if (destination?.category) {
			if (!CATEGORIES.has(destination.category)) throw new BizError('Invalid message category.', 400);
			await db.prepare(`UPDATE email SET category = ?, category_override = 1
				WHERE user_id = ? AND email_id IN (${placeholders})`)
				.bind(destination.category, userId, ...ids).run();
			return;
		}

		const customFolderId = Number(destination?.customFolderId);
		if (Number.isSafeInteger(customFolderId) && customFolderId > 0) {
			const folder = await db.prepare(
				'SELECT folder_id FROM mail_folder WHERE user_id = ? AND folder_id = ?'
			).bind(userId, customFolderId).first();
			if (!folder) throw new BizError('Folder not found.', 404);
			const statements = [removeCustomFolders];
			statements.push(db.prepare(`UPDATE email SET mailbox_folder = 'custom', snoozed_until = NULL, is_del = 0
				WHERE user_id = ? AND email_id IN (${placeholders})`).bind(userId, ...ids));
			for (const id of ids) {
				statements.push(db.prepare(
					'INSERT INTO email_folder (email_id, user_id, folder_id) VALUES (?, ?, ?)'
				).bind(id, userId, customFolderId));
			}
			await db.batch(statements);
			return;
		}

		if (!SYSTEM_FOLDERS.has(destination)) throw new BizError('Invalid folder.', 400);
		const typeRows = await db.prepare(
			`SELECT type FROM email WHERE user_id = ? AND email_id IN (${placeholders})`
		).bind(userId, ...ids).all();
		if ((destination === 'inbox' || destination === 'spam')
			&& typeRows.results.some(row => row.type !== 0)) {
			throw new BizError('Only received messages can be moved to this folder.', 400);
		}
		if (destination === 'sent' && typeRows.results.some(row => row.type !== 1)) {
			throw new BizError('Only sent messages can be moved to Sent.', 400);
		}
		await db.batch([
			removeCustomFolders,
			db.prepare(`UPDATE email SET mailbox_folder = ?, snoozed_until = NULL, is_del = 0
				WHERE user_id = ? AND email_id IN (${placeholders})`)
				.bind(destination, userId, ...ids)
		]);
	},

	async setCategory(c, userId, params) {
		const ids = await ownedMessageIds(c, messageIds(params?.emailIds), userId);
		if (!CATEGORIES.has(params?.category)) throw new BizError('Invalid message category.', 400);
		const placeholders = ids.map(() => '?').join(',');
		await database(c).prepare(`UPDATE email SET category = ?, category_override = 1
			WHERE user_id = ? AND email_id IN (${placeholders})`)
			.bind(params.category, userId, ...ids).run();
	},

	async listTemplates(c, userId) {
		const { results } = await database(c).prepare(`
			SELECT template_id AS templateId, name, subject, content
			FROM email_template WHERE user_id = ? ORDER BY name COLLATE NOCASE
		`).bind(userId).all();
		return results;
	},

	async saveTemplate(c, userId, params) {
		const id = Number(params?.templateId) || 0;
		const name = validateName(params?.name, 'Template name');
		const subject = typeof params?.subject === 'string' ? params.subject.slice(0, 500) : '';
		const content = typeof params?.content === 'string' ? params.content.slice(0, 50000) : '';
		if (id) {
			const result = await database(c).prepare(`
				UPDATE email_template SET name = ?, subject = ?, content = ?, updated_at = CURRENT_TIMESTAMP
				WHERE user_id = ? AND template_id = ?
				RETURNING template_id AS templateId, name, subject, content
			`).bind(name, subject, content, userId, id).first();
			if (!result) throw new BizError('Template not found.', 404);
			return result;
		}
		return database(c).prepare(`
			INSERT INTO email_template (user_id, name, subject, content)
			VALUES (?, ?, ?, ?)
			RETURNING template_id AS templateId, name, subject, content
		`).bind(userId, name, subject, content).first();
	},

	async deleteTemplate(c, userId, templateId) {
		const id = Number(templateId);
		if (!Number.isSafeInteger(id) || id <= 0) throw new BizError('Invalid template.', 400);
		await database(c).prepare('DELETE FROM email_template WHERE user_id = ? AND template_id = ?')
			.bind(userId, id).run();
	}
};

export default mailboxService;

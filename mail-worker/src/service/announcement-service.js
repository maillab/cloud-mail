import BizError from '../error/biz-error';
import dayjs from 'dayjs';

const PRIORITIES = ['normal', 'important', 'critical'];
const STATUSES = ['draft', 'scheduled', 'published', 'archived'];
const AUDIENCES = ['all', 'team', 'role', 'member'];

function now() {
	return dayjs().format('YYYY-MM-DD HH:mm:ss');
}

const announcementService = {

	// ---------------------------------------------------------------------
	// Audience
	// ---------------------------------------------------------------------

	async resolveAudienceIds(c, audience) {
		const kinds = (audience || []).filter(item => item && AUDIENCES.includes(item.kind));
		if (!kinds.length) {
			throw new BizError('Choose at least one audience.');
		}
		for (const item of kinds) {
			if (item.kind !== 'all' && !item.targetId) {
				throw new BizError('An audience entry is missing its target.');
			}
		}
		return kinds;
	},

	async saveAudience(c, announcementId, audience) {
		await c.env.db.prepare(`DELETE FROM announcement_audience WHERE announcement_id = ?`)
			.bind(announcementId).run();
		for (const item of audience) {
			await c.env.db.prepare(
				`INSERT OR IGNORE INTO announcement_audience (announcement_id, kind, target_id) VALUES (?, ?, ?)`
			).bind(announcementId, item.kind, item.kind === 'all' ? null : Number(item.targetId)).run();
		}
	},

	async loadAudience(c, announcementId) {
		const rows = await c.env.db.prepare(
			`SELECT kind, target_id FROM announcement_audience WHERE announcement_id = ?`
		).bind(announcementId).all();
		return (rows.results || []).map(row => ({
			kind: row.kind,
			targetId: row.target_id
		}));
	},

	// True when `userId` (a member of `teamIds`, holding `roleId`) is inside the
	// announcement's audience. Everything is filtered server-side; the browser
	// never receives an announcement it is not in the audience for.
	async isInAudience(c, audience, { userId, teamIds, roleId }) {
		if (!audience.length) {
			return false;
		}
		for (const item of audience) {
			if (item.kind === 'all') return true;
			if (item.kind === 'member' && Number(item.targetId) === Number(userId)) return true;
			if (item.kind === 'role' && Number(item.targetId) === Number(roleId)) return true;
			if (item.kind === 'team' && (teamIds || []).map(Number).includes(Number(item.targetId))) return true;
		}
		return false;
	},

	async memberContext(c, userId) {
		const row = await c.env.db.prepare(
			`SELECT u.type AS role_id,
				(SELECT GROUP_CONCAT(team_id) FROM user_team WHERE user_id = u.user_id) AS team_ids
			 FROM user u WHERE u.user_id = ?`
		).bind(userId).first();

		const teamIds = row?.team_ids
			? String(row.team_ids).split(',').filter(Boolean).map(Number)
			: [];
		// A primary team recorded on the member row counts too.
		const primary = await c.env.db.prepare(`SELECT team_id FROM user WHERE user_id = ?`).bind(userId).first();
		if (primary?.team_id && !teamIds.includes(Number(primary.team_id))) {
			teamIds.push(Number(primary.team_id));
		}

		return { userId, roleId: row?.role_id || null, teamIds };
	},

	// ---------------------------------------------------------------------
	// Validation
	// ---------------------------------------------------------------------

	validate(body) {
		const title = String(body.title || '').trim();
		if (!title) {
			throw new BizError('Give the announcement a title.');
		}
		if (title.length > 160) {
			throw new BizError('Keep the title under 160 characters.');
		}
		const priority = PRIORITIES.includes(body.priority) ? body.priority : 'normal';
		return {
			title,
			body: String(body.body || '').slice(0, 20000),
			priority,
			publishAt: body.publishAt ? dayjs(body.publishAt).format('YYYY-MM-DD HH:mm:ss') : null,
			expireAt: body.expireAt ? dayjs(body.expireAt).format('YYYY-MM-DD HH:mm:ss') : null,
			requiresAck: body.requiresAck ? 1 : 0,
			pinned: body.pinned ? 1 : 0
		};
	},

	// ---------------------------------------------------------------------
	// Member-facing reads
	// ---------------------------------------------------------------------

	async listForMember(c, userId) {
		const context = await this.memberContext(c, userId);

		const rows = await c.env.db.prepare(
			`SELECT * FROM announcement
			 WHERE status = 'published'
			 AND (publish_at IS NULL OR publish_at <= CURRENT_TIMESTAMP)
			 AND (expire_at IS NULL OR expire_at > CURRENT_TIMESTAMP)
			 ORDER BY pinned DESC, COALESCE(publish_at, created_at) DESC`
		).all();

		const visible = [];
		for (const row of rows.results || []) {
			const audience = await this.loadAudience(c, row.id);
			if (!await this.isInAudience(c, audience, context)) {
				continue;
			}
			const [ack, read] = await Promise.all([
				c.env.db.prepare(
					`SELECT acknowledged_at FROM announcement_ack WHERE announcement_id = ? AND user_id = ?`
				).bind(row.id, userId).first(),
				c.env.db.prepare(
					`SELECT read_at FROM announcement_read WHERE announcement_id = ? AND user_id = ?`
				).bind(row.id, userId).first()
			]);
			visible.push({
				id: row.id,
				title: row.title,
				body: row.body,
				priority: row.priority,
				pinned: Boolean(row.pinned),
				requiresAck: Boolean(row.requiresAck),
				publishAt: row.publish_at,
				expireAt: row.expire_at,
				createdAt: row.created_at,
				publishedAt: row.published_at,
				acknowledgedAt: ack?.acknowledged_at || null,
				readAt: read?.read_at || null
			});
		}

		return visible;
	},

	async acknowledge(c, announcementId, userId) {
		const row = await c.env.db.prepare(
			`SELECT id, requires_ack FROM announcement WHERE id = ? AND status = 'published'`
		).bind(announcementId).first();
		if (!row) {
			throw new BizError('That announcement is no longer available.', 404);
		}
		await c.env.db.prepare(
			`INSERT OR IGNORE INTO announcement_ack (announcement_id, user_id) VALUES (?, ?)`
		).bind(announcementId, userId).run();
		return { acknowledged: true, required: Boolean(row.requires_ack) };
	},

	async markRead(c, announcementId, userId) {
		await c.env.db.prepare(
			`INSERT OR IGNORE INTO announcement_read (announcement_id, user_id) VALUES (?, ?)`
		).bind(announcementId, userId).run();
		return { read: true };
	},

	async unreadCount(c, userId) {
		const rows = await c.env.db.prepare(
			`SELECT a.id FROM announcement a
			 WHERE a.status = 'published'
			 AND (a.publish_at IS NULL OR a.publish_at <= CURRENT_TIMESTAMP)
			 AND (a.expire_at IS NULL OR a.expire_at > CURRENT_TIMESTAMP)
			 AND NOT EXISTS (SELECT 1 FROM announcement_read r WHERE r.announcement_id = a.id AND r.user_id = ?)`
		).bind(userId).all();

		const context = await this.memberContext(c, userId);
		let count = 0;
		for (const row of rows.results || []) {
			const audience = await this.loadAudience(c, row.id);
			if (await this.isInAudience(c, audience, context)) {
				count++;
			}
		}
		return count;
	},

	// ---------------------------------------------------------------------
	// Administration
	// ---------------------------------------------------------------------

	async listAll(c) {
		const rows = await c.env.db.prepare(
			`SELECT a.*, u.display_name AS created_by_name
			 FROM announcement a
			 LEFT JOIN user u ON u.user_id = a.created_by
			 ORDER BY a.id DESC`
		).all();
		return rows.results || [];
	},

	async get(c, id) {
		const row = await c.env.db.prepare(`SELECT * FROM announcement WHERE id = ?`).bind(id).first();
		if (!row) {
			throw new BizError('That announcement does not exist.', 404);
		}
		row.audience = await this.loadAudience(c, id);
		return row;
	},

	async create(c, body, actorId) {
		const fields = this.validate(body);
		const audience = await this.resolveAudienceIds(c, body.audience);

		const result = await c.env.db.prepare(
			`INSERT INTO announcement (title, body, priority, status, publish_at, expire_at,
			 requires_ack, pinned, created_by, updated_by)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).bind(
			fields.title,
			fields.body,
			fields.priority,
			STATUSES.includes(body.status) ? body.status : 'draft',
			fields.publishAt,
			fields.expireAt,
			fields.requiresAck,
			fields.pinned,
			actorId,
			actorId
		).run();

		const id = result.meta.last_row_id;
		await this.saveAudience(c, id, audience);
		await this.audit(c, actorId, 'created', id, fields.title);
		return this.get(c, id);
	},

	async update(c, id, body, actorId) {
		const existing = await this.get(c, id);
		const fields = this.validate(body);
		const audience = await this.resolveAudienceIds(c, body.audience);

		await c.env.db.prepare(
			`UPDATE announcement SET title = ?, body = ?, priority = ?, publish_at = ?, expire_at = ?,
			 requires_ack = ?, pinned = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
			 WHERE id = ?`
		).bind(
			fields.title,
			fields.body,
			fields.priority,
			fields.publishAt,
			fields.expireAt,
			fields.requiresAck,
			fields.pinned,
			actorId,
			id
		).run();

		await this.saveAudience(c, id, audience);
		await this.audit(c, actorId, 'edited', id, `${existing.title} -> ${fields.title}`);
		return this.get(c, id);
	},

	async setStatus(c, id, status, actorId) {
		if (!STATUSES.includes(status)) {
			throw new BizError('Unknown announcement status.');
		}
		const existing = await this.get(c, id);
		const patch = { updated_by: actorId, updated_at: now() };

		if (status === 'published') {
			patch.status = 'published';
			patch.published_at = now();
		} else if (status === 'archived') {
			patch.status = 'archived';
			patch.archived_at = now();
		} else {
			patch.status = status;
		}

		await c.env.db.prepare(
			`UPDATE announcement SET status = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP,
				published_at = COALESCE(?, published_at), archived_at = ?
			 WHERE id = ?`
		).bind(
			patch.status,
			actorId,
			status === 'published' ? now() : null,
			status === 'archived' ? now() : null,
			id
		).run();

		await this.audit(c, actorId, status, id, existing.title);
		return this.get(c, id);
	},

	async remove(c, id, actorId) {
		const existing = await this.get(c, id);
		await c.env.db.prepare(`DELETE FROM announcement_audience WHERE announcement_id = ?`).bind(id).run();
		await c.env.db.prepare(`DELETE FROM announcement_ack WHERE announcement_id = ?`).bind(id).run();
		await c.env.db.prepare(`DELETE FROM announcement_read WHERE announcement_id = ?`).bind(id).run();
		await c.env.db.prepare(`DELETE FROM announcement WHERE id = ?`).bind(id).run();
		await this.audit(c, actorId, 'deleted', id, existing.title);
	},

	async audit(c, actorId, action, id, summary) {
		try {
			await c.env.db.prepare(
				`INSERT INTO announcement_audit (announcement_id, actor_id, action, summary, create_time)
				 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
			).bind(id, actorId, action, summary).run();
		} catch (error) {
			console.error('Announcement audit failed', error);
		}
	},

	async history(c, id) {
		const rows = await c.env.db.prepare(
			`SELECT aa.*, u.display_name AS actor_name
			 FROM announcement_audit aa LEFT JOIN user u ON u.user_id = aa.actor_id
			 WHERE aa.announcement_id = ? ORDER BY aa.id DESC`
		).bind(id).all();
		return rows.results || [];
	}
};

export default announcementService;
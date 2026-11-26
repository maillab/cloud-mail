// Idempotent internal notifications. Passing eventKey prevents duplicate
// deliveries for the same logical event (assignment, status change, reminder).
const notificationService = {
	async notify(c, {userId, actorId, type, title, body, link, eventKey}) {
		if (!userId) return null;
		if (eventKey) {
			const existing = await c.env.db.prepare(
				`SELECT id FROM notifications WHERE user_id = ? AND event_key = ? LIMIT 1`
			).bind(userId, eventKey).first();
			if (existing) return existing.id;
		}
		const {meta} = await c.env.db.prepare(
			`INSERT INTO notifications (user_id, actor_user_id, type, title, body, link, event_key, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
		).bind(userId, actorId ?? null, type ?? 'info', title ?? '', body ?? '', link ?? '', eventKey ?? '').run();
		return meta.last_row_id;
	}
};

export default notificationService;
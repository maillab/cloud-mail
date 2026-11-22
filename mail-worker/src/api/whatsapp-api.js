import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';

// SAFETY: One official XPass WhatsApp business number.
// AI suggests replies only — never auto-sends. Human must explicitly approve every outgoing message.
// The send endpoint REQUIRES human_approved=true in the body; otherwise it is rejected.

app.get('/whatsapp/conversations', async (c) => {
	const userId = userContext.getUserId(c);
	const { page = 1, pageSize = 50 } = c.req.query();

	const { results } = await c.env.db.prepare(
		`SELECT * FROM whatsapp_conversations WHERE user_id = ? AND is_del = 0 ORDER BY last_message_at DESC LIMIT ? OFFSET ?`
	).bind(userId, Number(pageSize), (Number(page) - 1) * Number(pageSize)).all();

	return c.json(result.ok({ list: results, total: results.length }));
});

app.get('/whatsapp/messages/:conversationId', async (c) => {
	const userId = userContext.getUserId(c);
	const conversationId = c.req.param('conversationId');
	const { page = 1, pageSize = 50 } = c.req.query();

	// Page from the newest message backwards, then return oldest-first for display.
	const sql = `SELECT * FROM whatsapp_messages WHERE conversation_id = ? AND user_id = ? AND is_del = 0 ORDER BY create_time DESC LIMIT ? OFFSET ?`;
	const { results } = await c.env.db.prepare(sql)
		.bind(conversationId, userId, Number(pageSize), (Number(page) - 1) * Number(pageSize)).all();
	const list = (results || []).slice().reverse();

	const countRow = await c.env.db.prepare(
		`SELECT COUNT(*) as cnt FROM whatsapp_messages WHERE conversation_id = ? AND user_id = ? AND is_del = 0`
	).bind(conversationId, userId).first();

	return c.json(result.ok({ list, total: countRow?.cnt ?? 0 }));
});

app.post('/whatsapp/suggest', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { conversation_id, suggestion } = body;

	const { meta } = await c.env.db.prepare(
		`INSERT INTO whatsapp_messages (user_id, conversation_id, direction, body, ai_suggested, human_approved, create_time) VALUES (?, ?, 'outbound', ?, 1, 0, CURRENT_TIMESTAMP)`
	).bind(userId, conversation_id ?? 0, suggestion ?? '').run();

	return c.json(result.ok({ id: meta.last_row_id, ai_suggested: true, human_approved: false }));
});

app.post('/whatsapp/send', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { conversation_id, message, human_approved } = body;

	// HARD SAFETY GATE: AI-suggested messages must never auto-send.
	if (human_approved !== true) {
		return c.json(result.fail('Outgoing WhatsApp messages require explicit human approval (human_approved=true).', 403), 403);
	}

	const { meta } = await c.env.db.prepare(
		`INSERT INTO whatsapp_messages (user_id, conversation_id, direction, body, ai_suggested, human_approved, sent_at, create_time) VALUES (?, ?, 'outbound', ?, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
	).bind(userId, conversation_id ?? 0, message ?? '').run();

	await c.env.db.prepare(
		`UPDATE whatsapp_conversations SET last_message = ?, last_message_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`
	).bind(message ?? '', conversation_id ?? 0, userId).run();

	return c.json(result.ok({ id: meta.last_row_id, sent: true, human_approved: true }));
});
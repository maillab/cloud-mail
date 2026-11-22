import KvConst from '../const/kv-const';

const auditService = {
	async log(c, userId, method, path, email) {
		try {
			const body = c.req.raw.bodyUsed ? null : null;
			const meta = {
				userId,
				email,
				method,
				path,
				timestamp: new Date().toISOString()
			};
			await c.env.db.prepare(
				`INSERT INTO crm_audit_log (user_id, email, method, path, create_time) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
			).bind(userId, email, method, path).run();
		} catch (error) {
			console.error('Audit log failed:', error);
		}
	}
};

export default auditService;

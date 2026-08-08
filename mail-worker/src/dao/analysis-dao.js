import { emailConst } from '../const/entity-const';

function offsetModifier(offsetMinutes) {
	const minutes = Number(offsetMinutes);
	if (!Number.isInteger(minutes) || minutes < -14 * 60 || minutes > 14 * 60) {
		throw new TypeError('Invalid timezone offset');
	}
	return `${minutes >= 0 ? '+' : ''}${minutes} minutes`;
}

async function dayCount(c, table, extraWhere, offsetMinutes) {
	const modifier = offsetModifier(offsetMinutes);
	const { results } = await c.env.db.prepare(`
		SELECT DATE(create_time, ?) AS date, COUNT(*) AS total
		FROM ${table}
		WHERE DATE(create_time, ?) BETWEEN DATE('now', '-15 days', ?) AND DATE('now', '-1 day', ?)
		${extraWhere}
		GROUP BY DATE(create_time, ?)
		ORDER BY date ASC
	`).bind(modifier, modifier, modifier, modifier, modifier).all();
	return results;
}

const analysisDao = {
	async numberCount(c) {
		const { results } = await c.env.db.prepare(`
			SELECT
				COALESCE(e.receiveTotal, 0) AS receiveTotal,
				COALESCE(e.sendTotal, 0) AS sendTotal,
				COALESCE(e.delReceiveTotal, 0) AS delReceiveTotal,
				COALESCE(e.delSendTotal, 0) AS delSendTotal,
				COALESCE(e.normalReceiveTotal, 0) AS normalReceiveTotal,
				COALESCE(e.normalSendTotal, 0) AS normalSendTotal,
				COALESCE(u.userTotal, 0) AS userTotal,
				COALESCE(u.normalUserTotal, 0) AS normalUserTotal,
				COALESCE(u.delUserTotal, 0) AS delUserTotal,
				COALESCE(a.accountTotal, 0) AS accountTotal,
				COALESCE(a.normalAccountTotal, 0) AS normalAccountTotal,
				COALESCE(a.delAccountTotal, 0) AS delAccountTotal
			FROM (
				SELECT
					SUM(CASE WHEN type = 0 THEN 1 ELSE 0 END) AS receiveTotal,
					SUM(CASE WHEN type = 1 THEN 1 ELSE 0 END) AS sendTotal,
					SUM(CASE WHEN type = 0 AND is_del = 1 THEN 1 ELSE 0 END) AS delReceiveTotal,
					SUM(CASE WHEN type = 1 AND is_del = 1 THEN 1 ELSE 0 END) AS delSendTotal,
					SUM(CASE WHEN type = 0 AND is_del = 0 THEN 1 ELSE 0 END) AS normalReceiveTotal,
					SUM(CASE WHEN type = 1 AND is_del = 0 THEN 1 ELSE 0 END) AS normalSendTotal
				FROM email WHERE status != ?
			) e
			CROSS JOIN (
				SELECT COUNT(*) AS userTotal,
					SUM(CASE WHEN is_del = 1 THEN 1 ELSE 0 END) AS delUserTotal,
					SUM(CASE WHEN is_del = 0 THEN 1 ELSE 0 END) AS normalUserTotal
				FROM user
			) u
			CROSS JOIN (
				SELECT COUNT(*) AS accountTotal,
					SUM(CASE WHEN is_del = 1 THEN 1 ELSE 0 END) AS delAccountTotal,
					SUM(CASE WHEN is_del = 0 THEN 1 ELSE 0 END) AS normalAccountTotal
				FROM account
			) a
		`).bind(emailConst.status.SAVING).all();
		return results[0];
	},

	async userDayCount(c, offsetMinutes) {
		return dayCount(c, 'user', '', offsetMinutes);
	},

	async receiveDayCount(c, offsetMinutes) {
		return dayCount(c, 'email', 'AND type = 0', offsetMinutes);
	},

	async sendDayCount(c, offsetMinutes) {
		return dayCount(c, 'email', 'AND type = 1', offsetMinutes);
	}
};

export default analysisDao;

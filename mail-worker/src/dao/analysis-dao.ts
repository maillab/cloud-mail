import type { DatabaseContext } from '../types/context';
import type { AnalysisNumberCountRow, AnalysisDayCountRow } from '../types/database';

const analysisDao = {
	async numberCount(c: DatabaseContext) {
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
            FROM
                (
                    SELECT
                        SUM(CASE WHEN type = 0 THEN 1 ELSE 0 END) AS receiveTotal,
                        SUM(CASE WHEN type = 1 THEN 1 ELSE 0 END) AS sendTotal,
                        SUM(CASE WHEN type = 0 AND is_del = 1 THEN 1 ELSE 0 END) AS delReceiveTotal,
                        SUM(CASE WHEN type = 1 AND is_del = 1 THEN 1 ELSE 0 END) AS delSendTotal,
                        SUM(CASE WHEN type = 0 AND is_del = 0 THEN 1 ELSE 0 END) AS normalReceiveTotal,
                        SUM(CASE WHEN type = 1 AND is_del = 0 THEN 1 ELSE 0 END) AS normalSendTotal
                    FROM
                        email
                ) e
            CROSS JOIN (
                SELECT
                    COUNT(*) AS userTotal,
                    SUM(CASE WHEN is_del = 1 THEN 1 ELSE 0 END) AS delUserTotal,
                    SUM(CASE WHEN is_del = 0 THEN 1 ELSE 0 END) AS normalUserTotal
                FROM
                    user
            ) u
            CROSS JOIN (
                SELECT
                    COUNT(*) AS accountTotal,
                    SUM(CASE WHEN is_del = 1 THEN 1 ELSE 0 END) AS delAccountTotal,
                    SUM(CASE WHEN is_del = 0 THEN 1 ELSE 0 END) AS normalAccountTotal
                FROM
                    account
            ) a
        `).all<AnalysisNumberCountRow>();
		return results[0];
	},

	async userDayCount(c: DatabaseContext, diffHours: number) {
		const { tzMod, tzBack } = this.tzModifiers(diffHours);
		const { results } = await c.env.db.prepare(`
            SELECT
                DATE(create_time, '${tzMod}') AS date,
                COUNT(*) AS total
            FROM
                user
            WHERE
                create_time >= datetime('now', '${tzMod}', 'start of day', '-15 days', '${tzBack}')
                AND create_time < datetime('now', '${tzMod}', 'start of day', '${tzBack}')
            GROUP BY
                DATE(create_time, '${tzMod}')
            ORDER BY
                date ASC
        `).all<AnalysisDayCountRow>();
		return results;
	},

	async receiveDayCount(c: DatabaseContext, diffHours: number) {
		const { tzMod, tzBack } = this.tzModifiers(diffHours);
		const { results } = await c.env.db.prepare(`
            SELECT
                DATE(create_time, '${tzMod}') AS date,
                COUNT(*) AS total
            FROM
                email
            WHERE
                type = 0
                AND create_time >= datetime('now', '${tzMod}', 'start of day', '-15 days', '${tzBack}')
                AND create_time < datetime('now', '${tzMod}', 'start of day', '${tzBack}')
            GROUP BY
                DATE(create_time, '${tzMod}')
            ORDER BY
                date ASC
        `).all<AnalysisDayCountRow>();
		return results;
	},

	async sendDayCount(c: DatabaseContext, diffHours: number) {
		const { tzMod, tzBack } = this.tzModifiers(diffHours);
		const { results } = await c.env.db.prepare(`
            SELECT
                DATE(create_time, '${tzMod}') AS date,
                COUNT(*) AS total
            FROM
                email
            WHERE
                type = 1
                AND create_time >= datetime('now', '${tzMod}', 'start of day', '-15 days', '${tzBack}')
                AND create_time < datetime('now', '${tzMod}', 'start of day', '${tzBack}')
            GROUP BY
                DATE(create_time, '${tzMod}')
            ORDER BY
                date ASC
        `).all<AnalysisDayCountRow>();
		return results;
	},

	tzModifiers(diffHours: number) {
		const tzMod = diffHours >= 0 ? `+${diffHours} hours` : `${diffHours} hours`;
		const tzBack = (-diffHours) >= 0 ? `+${-diffHours} hours` : `${-diffHours} hours`;
		return { tzMod, tzBack };
	}

};

export default analysisDao;

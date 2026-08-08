import orm from '../entity/orm';
import verifyRecord from '../entity/verify-record';
import { eq, and, lt, sql } from 'drizzle-orm';
import reqUtils from '../utils/req-utils';
import { verifyRecordType } from '../const/entity-const';

function identity(c) {
	const ip = reqUtils.getIp(c);
	return ip && ip !== 'unknown' ? ip.slice(0, 128) : 'unknown';
}

async function increase(c, type) {
	const ip = identity(c);
	return c.env.db.prepare(`
		INSERT INTO verify_record (ip, count, type, update_time)
		VALUES (?, 1, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(ip, type) DO UPDATE SET
			count = verify_record.count + 1,
			update_time = CURRENT_TIMESTAMP
		RETURNING *
	`).bind(ip, type).first();
}

const verifyRecordService = {
	async selectListByIP(c) {
		return orm(c).select().from(verifyRecord).where(eq(verifyRecord.ip, identity(c))).all();
	},

	async clearRecord(c) {
		await orm(c).delete(verifyRecord).where(lt(verifyRecord.updateTime, sql`datetime('now','-1 day')`)).run();
	},

	async isOpenRegVerify(c, regVerifyCount) {
		const row = await orm(c).select().from(verifyRecord).where(and(
			eq(verifyRecord.ip, identity(c)),
			eq(verifyRecord.type, verifyRecordType.REG)
		)).get();
		return Number(row?.count || 0) >= Number(regVerifyCount || 0);
	},

	async isOpenAddVerify(c, addVerifyCount) {
		const row = await orm(c).select().from(verifyRecord).where(and(
			eq(verifyRecord.ip, identity(c)),
			eq(verifyRecord.type, verifyRecordType.ADD)
		)).get();
		return Number(row?.count || 0) >= Number(addVerifyCount || 0);
	},

	async increaseRegCount(c) { return increase(c, verifyRecordType.REG); },
	async increaseAddCount(c) { return increase(c, verifyRecordType.ADD); }
};

export default verifyRecordService;

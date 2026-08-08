import orm from '../entity/orm';
import { star } from '../entity/star';
import emailService from './email-service';
import BizError from '../error/biz-error';
import { and, count, desc, eq, lt, sql, inArray } from 'drizzle-orm';
import email from '../entity/email';
import { isDel } from '../const/entity-const';
import attService from './att-service';
import { t } from '../i18n/i18n';
import { toId, toPageSize } from '../utils/input-utils';
import { normalizeEmailCursor } from '../utils/email-query-utils';

const starService = {
	async add(c, params = {}, userId) {
		const emailId = toId(params.emailId, 'emailId');
		const emailRow = await emailService.selectById(c, emailId);
		if (!emailRow || Number(emailRow.userId) !== Number(userId) || Number(emailRow.isDel) !== isDel.NORMAL) {
			throw new BizError(t('starNotExistEmail'));
		}
		await c.env.db.prepare(`
			INSERT INTO star (user_id, email_id)
			SELECT ?, ?
			WHERE NOT EXISTS (SELECT 1 FROM star WHERE user_id = ? AND email_id = ?)
		`).bind(userId, emailId, userId, emailId).run();
	},

	async cancel(c, params = {}, userId) {
		const emailId = toId(params.emailId, 'emailId');
		await orm(c).delete(star).where(and(eq(star.userId, userId), eq(star.emailId, emailId))).run();
	},

	async list(c, params = {}, userId) {
		// Starred 页面第一页也发送 0，按“最新一封之前”处理。
		const cursor = normalizeEmailCursor(params.emailId, { timeSort: 0 });
		const size = toPageSize(params.size, { defaultValue: 20, max: 50 });
		const baseConditions = and(
			eq(star.userId, userId),
			eq(email.userId, userId),
			eq(email.isDel, isDel.NORMAL)
		);

		const [list, totalRow] = await Promise.all([
			orm(c).select({
				isStar: sql`1`.as('isStar'),
				starId: star.starId,
				...email
			}).from(star)
				.innerJoin(email, eq(email.emailId, star.emailId))
				.where(and(baseConditions, lt(star.emailId, cursor)))
				.orderBy(desc(star.emailId))
				.limit(size)
				.all(),
			orm(c).select({ total: count() }).from(star)
				.innerJoin(email, eq(email.emailId, star.emailId))
				.where(baseConditions)
				.get()
		]);

		const emailIds = list.map(item => item.emailId);
		const attsList = emailIds.length ? await attService.selectByEmailIds(c, emailIds) : [];
		for (const emailRow of list) {
			emailRow.attList = attsList.filter(attRow => attRow.emailId === emailRow.emailId);
		}
		return {
			list,
			total: Number(totalRow?.total || 0),
			latestEmail: list[0] || { emailId: 0 }
		};
	},

	async removeByEmailIds(c, emailIds = []) {
		const ids = [...new Set((Array.isArray(emailIds) ? emailIds : []).map(Number).filter(Number.isSafeInteger))];
		if (!ids.length) return;
		await orm(c).delete(star).where(inArray(star.emailId, ids)).run();
	}
};

export default starService;

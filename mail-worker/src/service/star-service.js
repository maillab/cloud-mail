import orm from '../entity/orm';
import { star } from '../entity/star';
import emailService from './email-service';
import BizError from '../error/biz-error';
import { and, desc, eq, lt, sql, inArray } from 'drizzle-orm';
import email from '../entity/email';
import { emailListColumns, emailBriefColumns } from '../lib/email-list-columns';
import { isDel } from '../const/entity-const';
import attService from "./att-service";
import { t } from '../i18n/i18n'
import proxyService from './proxy-service';
const starService = {

	async add(c, params, userId) {
		const { emailId } = params;
		const email = await emailService.selectById(c, emailId);
		if (!email) {
			throw new BizError(t('starNotExistEmail'));
		}
		if (email.userId !== userId) {
			throw new BizError(t('starNotExistEmail'));
		}
		const exist = await orm(c).select().from(star).where(
			and(
				eq(star.userId, userId),
				eq(star.emailId, emailId)))
			.get()

		if (exist) {
			return
		}

		await orm(c).insert(star).values({ userId, emailId }).run();
	},

	async cancel(c, params, userId) {
		const { emailId } = params;
		await orm(c).delete(star).where(
			and(
				eq(star.userId, userId),
				eq(star.emailId, emailId)))
			.run();
	},

	async list(c, params, userId) {
		let { emailId, size, full } = params;
		emailId = Number(emailId) || 0;
		size = Number(size);
		full = Number(full) === 1;
		const columns = full ? emailListColumns : emailBriefColumns;

		const list = await orm(c).select({
			isStar: sql`1`.as('isStar'),
			starId: star.starId,
			...columns
		}).from(star)
			.leftJoin(email, eq(email.emailId, star.emailId))
			.where(
				and(
					eq(star.userId, userId),
					eq(email.isDel, isDel.NORMAL),
					emailId ? lt(star.emailId, emailId) : undefined))
			.orderBy(desc(star.emailId))
			.limit(size)
			.all();

		if (full) {
			const emailIds = list.map(item => item.emailId);
			const attsList = await attService.selectByEmailIds(c, emailIds);
			list.forEach(emailRow => {
				emailRow.attList = attsList.filter(attsRow => attsRow.emailId === emailRow.emailId);
			});
			// 星标完整查询同样走图片代理改写。
			await proxyService.rewriteList(c, list);
		} else {
			list.forEach(emailRow => {
				emailRow.listText = emailService.toListText(emailRow);
				delete emailRow.text;
				delete emailRow.content;
			});
		}

		return { list };
	},
	async removeByEmailIds(c, emailIds) {
		await orm(c).delete(star).where(inArray(star.emailId, emailIds)).run();
	},

	async removeByUserIds(c, userIds) {
		await orm(c).delete(star).where(inArray(star.userId, userIds)).run();
	}
};

export default starService;

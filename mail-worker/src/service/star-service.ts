import type { EnvContext } from '../types/context';
import type { ScalarId } from '../types/api';
import type { AttachmentRow } from '../types/attachment';
import { boundId } from '../lib/bound-id';
import { applyBriefListText } from '../lib/email-list-text';
import orm from '../entity/orm';
import { star } from '../entity/star';
import emailDao from '../dao/email-dao';
import BizError from '../error/biz-error';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import email from '../entity/email';
import { emailListColumns, emailBriefColumns } from '../lib/email-list-columns';
import { isDel } from '../const/entity-const';
import attDao from '../dao/att-dao';
import { attachListAttachments } from '../lib/email-list-attachments';
import { tFor } from '../i18n/i18n'
const starService = {

	async add(c: EnvContext, params: { emailId: ScalarId }, userId: number) {
		const t = tFor(c);
		const { emailId } = params;
		const email = await emailDao.selectById(c, emailId);
		if (!email) {
			throw new BizError(t('starNotExistEmail'));
		}
		if (email.userId !== userId) {
			throw new BizError(t('starNotExistEmail'));
		}
		const exist = await orm(c).select().from(star).where(
			and(
				eq(star.userId, userId),
				eq(star.emailId, boundId(emailId))))
			.get()

		if (exist) {
			return
		}

		await orm(c).insert(star).values({ userId, emailId: boundId(emailId) }).run();
	},

	async cancel(c: EnvContext, params: { emailId: ScalarId }, userId: number) {
		const { emailId } = params;
		await orm(c).delete(star).where(
			and(
				eq(star.userId, userId),
				eq(star.emailId, boundId(emailId))))
			.run();
	},

	async list(c: EnvContext, params: { emailId?: string; size?: string; full?: string | boolean }, userId: number) {
		const emailId = Number(params.emailId) || 0;
		const size = Number(params.size);
		const full = Number(params.full) === 1;
		const columns = full ? emailListColumns : emailBriefColumns;

		const query = orm(c).select({
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
			.limit(size);
		type Projection = Awaited<ReturnType<typeof query.all>>[number];
		const list: (Omit<Projection, 'text' | 'content'> & { text?: string | null; content?: string | null; attList?: AttachmentRow[]; listText?: string })[] = await query.all();

		if (full) {
			const emailIds = list.map(item => item.emailId);
			const attsList = await attDao.selectByEmailIds(c, emailIds);
			attachListAttachments(list, attsList);
		} else {
			applyBriefListText(list);
		}

		return { list };
	}
};

export default starService;

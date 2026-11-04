import orm from '../entity/orm';
import email from '../entity/email';
import { and, eq, count, ne, inArray } from 'drizzle-orm';
import { emailConst, isDel } from '../const/entity-const';
import { boundId } from '../lib/bound-id';
import type { EnvContext } from '../types/context';
import type { ScalarId } from '../types/api';
import type { EmailRow, EmailStatusUpdate } from '../types/email';

const emailDao = {
	selectById(c: EnvContext, emailId: ScalarId | undefined): Promise<EmailRow | undefined> {
		return orm(c).select().from(email).where(
			and(eq(email.emailId, boundId(emailId)),
				eq(email.isDel, isDel.NORMAL)))
			.get();
	},

	updateEmailStatus(c: EnvContext, params: EmailStatusUpdate): Promise<EmailRow | undefined> {
		const { status, resendEmailId, message } = params;
		return orm(c).update(email).set({
			status: status,
			message: message
		}).where(eq(email.resendEmailId, resendEmailId)).returning().get();
	},

	async selectUserEmailCountList(c: EnvContext, userIds: number[], type: number, del: number = isDel.NORMAL): Promise<{ userId: number; count: number }[]> {
		const result = await orm(c)
			.select({
				userId: email.userId,
				count: count(email.emailId)
			})
			.from(email)
			.where(and(
				inArray(email.userId, userIds),
				eq(email.type, type),
				eq(email.isDel, del),
				ne(email.status, emailConst.status.SAVING),
			))
			.groupBy(email.userId);
		return result;
	},

	async restoreByUserId(c: EnvContext, userId: ScalarId): Promise<void> {
		await orm(c).update(email).set({ isDel: isDel.NORMAL }).where(eq(email.userId, boundId(userId))).run();
	},
};
export default emailDao;

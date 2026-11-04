import orm from '../entity/orm';
import account from '../entity/account';
import { and, eq, sql, count, inArray } from 'drizzle-orm';
import { isDel } from '../const/entity-const';
import { boundId } from '../lib/bound-id';
import type { EnvContext } from '../types/context';
import type { ScalarId } from '../types/api';
import type { NewAccount } from '../types/user';

const accountDao = {
	selectByEmailIncludeDel(c: EnvContext, email: string) {
		return orm(c).select().from(account).where(sql`${account.email} COLLATE NOCASE = ${email}`).get();
	},

	selectById(c: EnvContext, accountId: ScalarId | undefined) {
		return orm(c).select().from(account).where(
			and(eq(account.accountId, boundId(accountId)),
				eq(account.isDel, isDel.NORMAL)))
			.get();
	},

	async insert(c: EnvContext, params: NewAccount & { type?: number }) {
		await orm(c).insert(account).values({ ...params }).returning();
	},

	async insertList(c: EnvContext, list: NewAccount[]) {
		await orm(c).insert(account).values(list).run();
	},

	async selectUserAccountCountList(c: EnvContext, userIds: number[], del: number = isDel.NORMAL) {
		const result = await orm(c)
			.select({
				userId: account.userId,
				count: count(account.accountId)
			})
			.from(account)
			.where(and(
				inArray(account.userId, userIds),
				eq(account.isDel, del)
			))
			.groupBy(account.userId)
		return result;
	},

	async countUserAccount(c: EnvContext, userId: ScalarId) {
		const { num } = (await orm(c).select({num: count()}).from(account).where(and(eq(account.userId, boundId(userId)),eq(account.isDel, isDel.NORMAL))).get())!;
		return num;
	},

	async restoreByEmail(c: EnvContext, email: string) {
		await orm(c).update(account).set({isDel: isDel.NORMAL}).where(eq(account.email, email)).run();
	},

	async restoreByUserId(c: EnvContext, userId: ScalarId) {
		await orm(c).update(account).set({isDel: isDel.NORMAL}).where(eq(account.userId, boundId(userId))).run();
	},
};
export default accountDao;

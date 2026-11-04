import orm from '../entity/orm';
import user from '../entity/user';
import { and, eq, sql, desc } from 'drizzle-orm';
import { isDel } from '../const/entity-const';
import { boundId } from '../lib/bound-id';
import type { EnvContext } from '../types/context';
import type { ScalarId } from '../types/api';
import type { NewUser } from '../types/user';

const userDao = {
	selectByEmail(c: EnvContext, email: string) {
		return orm(c).select().from(user).where(
			and(
				sql`${user.email} COLLATE NOCASE = ${email}`,
				eq(user.isDel, isDel.NORMAL)))
			.get();
	},

	async insert(c: EnvContext, params: NewUser) {
		const { userId } = await orm(c).insert(user).values({ ...params }).returning().get();
		return userId;
	},

	selectByEmailIncludeDel(c: EnvContext, email: string) {
		return orm(c).select().from(user).where(sql`${user.email} COLLATE NOCASE = ${email}`).get();
	},

	selectByIdIncludeDel(c: EnvContext, userId: ScalarId) {
		return orm(c).select().from(user).where(eq(user.userId, boundId(userId))).get();
	},

	selectById(c: EnvContext, userId: ScalarId) {
		return orm(c).select().from(user).where(
			and(
				eq(user.userId, boundId(userId)),
				eq(user.isDel, isDel.NORMAL)))
			.get();
	},

	async updateAllUserType(c: EnvContext, type: number, curType: ScalarId) {
		await orm(c).update(user).set({ type }).where(eq(user.type, boundId(curType))).run();
	},

	async incrUserSendCount(c: EnvContext, quantity: number, userId: ScalarId) {
		await orm(c).update(user).set({ sendCount: sql`${user.sendCount}
	  +
	  ${quantity}` }).where(eq(user.userId, boundId(userId))).run();
	},

	listByRegKeyId(c: EnvContext, regKeyId: ScalarId) {
		return orm(c).select({ email: user.email, createTime: user.createTime }).from(user)
			.where(eq(user.regKeyId, boundId(regKeyId))).orderBy(desc(user.userId)).all();
	},
};
export default userDao;

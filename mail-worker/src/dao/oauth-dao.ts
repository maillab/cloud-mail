import orm from '../entity/orm';
import { oauth } from '../entity/oauth';
import { eq, inArray } from 'drizzle-orm';
import type { DatabaseContext } from '../types/context';

const oauthDao = {
	async deleteByUserId(c: DatabaseContext, userId: number): Promise<void> {
		await this.deleteByUserIds(c, [userId]);
	},
	async deleteByUserIds(c: DatabaseContext, userIds: number[]): Promise<void> {
		await orm(c).delete(oauth).where(inArray(oauth.userId, userIds)).run();
	},
	async clearNoBindOathUser(c: DatabaseContext): Promise<void> {
		await orm(c).delete(oauth).where(eq(oauth.userId, 0)).run();
	},
};

export default oauthDao;

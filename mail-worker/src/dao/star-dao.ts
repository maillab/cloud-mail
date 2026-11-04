import orm from '../entity/orm';
import { star } from '../entity/star';
import { inArray } from 'drizzle-orm';
import { boundIds } from '../lib/bound-id';
import type { EnvContext } from '../types/context';
import type { ScalarId } from '../types/api';
const starDao = {
	async removeByEmailIds(c: EnvContext, emailIds: ScalarId[]) {
		await orm(c).delete(star).where(inArray(star.emailId, boundIds(emailIds))).run();
	},

	async removeByUserIds(c: EnvContext, userIds: ScalarId[]) {
		await orm(c).delete(star).where(inArray(star.userId, boundIds(userIds))).run();
	}
};
export default starDao;

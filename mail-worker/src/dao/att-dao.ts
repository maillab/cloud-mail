import orm from '../entity/orm';
import { att } from '../entity/att';
import { and, eq, isNull, inArray, desc } from 'drizzle-orm';
import { attConst } from '../const/entity-const';
import { boundId, boundIds } from '../lib/bound-id';
import type { EnvContext } from '../types/context';
import type { ScalarId } from '../types/api';

const attDao = {
	list(c: EnvContext, params: { emailId: ScalarId }, userId: ScalarId) {
		const { emailId } = params;

		return orm(c).select().from(att).where(
			and(
				eq(att.emailId, boundId(emailId)),
				eq(att.userId, boundId(userId)),
				eq(att.type, attConst.type.ATT),
				isNull(att.contentId)
			)
		).all();
	},

	selectByEmailIds(c: EnvContext, emailIds: (ScalarId | null)[]) {
		return orm(c).select().from(att).where(
			and(
				inArray(att.emailId, boundIds(emailIds)),
				eq(att.type, attConst.type.ATT)
			))
			.all();
	},

	selectOneByKeys(c: EnvContext, keys: string[]) {
		if (!keys || keys.length === 0) {
			return []
		}
		return orm(c).select().from(att).where(inArray(att.key, keys)).orderBy(desc(att.attId)).groupBy(att.key).all();
	}
};
export default attDao;

import orm from '../entity/orm';
import regKey from '../entity/reg-key';
import { inArray, like, eq, desc, sql, or } from 'drizzle-orm';
import roleService from './role-service';
import BizError from '../error/biz-error';
import { formatDetailDate, toUtc } from '../utils/date-uitil';
import userDao from '../dao/user-dao';
import { tFor } from '../i18n/i18n';
import { boundId } from '../lib/bound-id';
import type { EnvContext } from '../types/context';
import type { ScalarId } from '../types/api';
import type { RegKeyInput, RegKeyDeleteInput, RegKeyListQuery, RegKeyHistoryQuery, RegKeyListItem } from '../types/admin';

const regKeyService = {

	async add(c: EnvContext, params: RegKeyInput, userId: ScalarId) {
		const t = tFor(c);

		const {code,roleId,count} = params;
		let {expireTime} = params;

		if (!code) {
			throw new BizError(t('emptyRegKey'));
		}

		if (!count) {
			throw new BizError(t('emptyRegKey'));
		}

		if (!expireTime) {
			throw new BizError(t('emptyRegKeyExpire'));
		}

		const regKeyRow = await orm(c).select().from(regKey).where(eq(regKey.code, code)).get();

		if (regKeyRow) {
			throw new BizError(t('isExistRegKye'));
		}

		const roleRow = await roleService.selectById(c, roleId);
		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}

		expireTime = formatDetailDate(expireTime)

		await orm(c).insert(regKey).values({code,roleId: boundId(roleId),count,userId: boundId(userId),expireTime}).run();
	},

	async delete(c: EnvContext, params: RegKeyDeleteInput) {
		const regKeyIds = params.regKeyIds.split(',').map(id => Number(id));
		await orm(c).delete(regKey).where(inArray(regKey.regKeyId,regKeyIds)).run();
	},

	async clearNotUse(c: EnvContext) {
		const now = formatDetailDate(toUtc().tz('Asia/Shanghai').startOf('day'))
		await orm(c).delete(regKey).where(or(eq(regKey.count, 0),sql`datetime(${regKey.expireTime}, '+8 hours') < datetime(${now})`)).run();
	},

	selectByCode(c: EnvContext, code: string) {
		return orm(c).select().from(regKey).where(eq(regKey.code, code)).get();
	},

	async list(c: EnvContext, params: RegKeyListQuery) {

		const {code} = params
		const base = orm(c).select().from(regKey)
		const query = code ? base.where(like(regKey.code, `${code}%`)) : base;

		const regKeyList: RegKeyListItem[] = await query.orderBy(desc(regKey.regKeyId)).all();
		const roleList = await roleService.roleSelectUse(c);

		const today = toUtc().tz('Asia/Shanghai').startOf('day')

		regKeyList.forEach(regKeyRow => {

			const index = roleList.findIndex(roleRow => roleRow.roleId === regKeyRow.roleId)
			regKeyRow.roleName = index > -1 ? roleList[index].name : ''

			const expireTime = toUtc(regKeyRow.expireTime).tz('Asia/Shanghai').startOf('day');

			if (expireTime.isBefore(today)) {
				regKeyRow.expireTime = null
			}
		})

		return regKeyList;
	},

	async reduceCount(c: EnvContext, code: string, count: number) {
		await orm(c).update(regKey).set({
			count: sql`${regKey.count}
	  -
	  ${count}`
		}).where(eq(regKey.code, code)).run();
	},

	async history(c: EnvContext, params: RegKeyHistoryQuery) {
		const { regKeyId } = params;
		return userDao.listByRegKeyId(c, regKeyId);
	}
}

export default regKeyService;

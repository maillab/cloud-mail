import orm from '../entity/orm';
import regKey from '../entity/reg-key';
import { inArray, like, eq, desc, sql, or, and, gt } from 'drizzle-orm';
import roleService from './role-service';
import BizError from '../error/biz-error';
import { toUtc } from '../utils/date-uitil';
import userService from './user-service';
import { t } from '../i18n/i18n.js';

const regKeyService = {

	async add(c, params, userId) {

		let {code,roleId,count,expireTime} = params;

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

		const expireUtc = toUtc(expireTime)
		if (!expireUtc.isValid()) {
			throw new BizError(t('emptyRegKeyExpire'));
		}
		expireTime = expireUtc.format('YYYY-MM-DD HH:mm:ss')

		await orm(c).insert(regKey).values({code,roleId,count,userId,expireTime}).run();
	},

	async delete(c, params) {
		let {regKeyIds} = params;
		regKeyIds = regKeyIds.split(',').map(id => Number(id));
		await orm(c).delete(regKey).where(inArray(regKey.regKeyId,regKeyIds)).run();
	},

	async clearNotUse(c) {
		const now = toUtc().format('YYYY-MM-DD HH:mm:ss')
		await orm(c).delete(regKey).where(or(eq(regKey.count, 0), sql`datetime(${regKey.expireTime}) <= datetime(${now})`)).run();
	},

	selectByCode(c, code) {
		return orm(c).select().from(regKey).where(eq(regKey.code, code)).get();
	},

	async list(c, params) {

		const {code} = params
		let query = orm(c).select().from(regKey)

		if (code) {
			query = query.where(like(regKey.code, `${code}%`))
		}

		const regKeyList = await query.orderBy(desc(regKey.regKeyId)).all();
		const roleList = await roleService.roleSelectUse(c);

		const now = toUtc()

		regKeyList.forEach(regKeyRow => {

			const index = roleList.findIndex(roleRow => roleRow.roleId === regKeyRow.roleId)
			regKeyRow.roleName = index > -1 ? roleList[index].name : ''

			const expireTime = toUtc(regKeyRow.expireTime);

			if (!expireTime.isAfter(now)) {
				regKeyRow.expireTime = null
			}
		})

		return regKeyList;
	},

	async consumeCount(c, code) {
		const rows = await orm(c).update(regKey)
			.set({ count: sql`${regKey.count} - 1` })
			.where(and(eq(regKey.code, code), gt(regKey.count, 0)))
			.returning({ regKeyId: regKey.regKeyId });
		return rows.length > 0;
	},

	async restoreCount(c, code) {
		await orm(c).update(regKey)
			.set({ count: sql`${regKey.count} + 1` })
			.where(eq(regKey.code, code))
			.run();
	},

	async history(c, params) {
		const { regKeyId } = params;
		return userService.listByRegKeyId(c, regKeyId);
	}
}

export default regKeyService;

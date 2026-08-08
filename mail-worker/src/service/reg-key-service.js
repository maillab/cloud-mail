import orm from '../entity/orm';
import regKey from '../entity/reg-key';
import { and, inArray, like, eq, desc, sql, or, gt } from 'drizzle-orm';
import roleService from './role-service';
import BizError from '../error/biz-error';
import { formatDetailDate, toUtc } from '../utils/date-uitil';
import userService from './user-service';
import { t } from '../i18n/i18n.js';
import { toId, toIdList, toInteger, toTrimmedString } from '../utils/input-utils';

const regKeyService = {
	async add(c, params, userId) {
		const code = toTrimmedString(params?.code, { name: '注册码', required: true, max: 128 });
		const roleId = toId(params?.roleId, 'roleId');
		const count = toInteger(params?.count, { name: 'count', required: true, min: 1, max: 1_000_000 });
		const expireInput = toTrimmedString(params?.expireTime, { name: '过期时间', required: true, max: 64 });

		const [existing, roleRow] = await Promise.all([
			orm(c).select().from(regKey).where(eq(regKey.code, code)).get(),
			roleService.selectById(c, roleId)
		]);
		if (existing) throw new BizError(t('isExistRegKye'));
		if (!roleRow) throw new BizError(t('roleNotExist'));

		const expireTime = formatDetailDate(expireInput);
		if (!expireTime || !toUtc(expireTime).isValid()) throw new BizError('注册码过期时间格式错误', 400);
		if (toUtc(expireTime).tz('Asia/Shanghai').endOf('day').isBefore(toUtc().tz('Asia/Shanghai'))) {
			throw new BizError(t('regKeyExpire'), 400);
		}

		await orm(c).insert(regKey).values({ code, roleId, count, userId, expireTime }).run();
	},

	async delete(c, params) {
		const regKeyIds = toIdList(params?.regKeyIds, { name: 'regKeyIds', maxItems: 500 });
		await orm(c).delete(regKey).where(inArray(regKey.regKeyId, regKeyIds)).run();
	},

	async clearNotUse(c) {
		const now = formatDetailDate(toUtc().tz('Asia/Shanghai').startOf('day'));
		await orm(c).delete(regKey).where(
			or(eq(regKey.count, 0), sql`datetime(${regKey.expireTime}, '+8 hours') < datetime(${now})`)
		).run();
	},

	selectByCode(c, code) {
		const normalized = toTrimmedString(code, { name: '注册码', required: true, max: 128 });
		return orm(c).select().from(regKey).where(eq(regKey.code, normalized)).get();
	},

	async list(c, params = {}) {
		const code = toTrimmedString(params.code, { name: '注册码', max: 128 });
		let query = orm(c).select().from(regKey);
		if (code) query = query.where(like(regKey.code, `${code}%`));

		const regKeyList = await query.orderBy(desc(regKey.regKeyId)).all();
		const roleList = await roleService.roleSelectUse(c);
		const today = toUtc().tz('Asia/Shanghai').startOf('day');
		const roleMap = new Map(roleList.map(row => [row.roleId, row.name]));

		for (const row of regKeyList) {
			row.roleName = roleMap.get(row.roleId) || '';
			const expireTime = toUtc(row.expireTime).tz('Asia/Shanghai').startOf('day');
			if (!expireTime.isValid() || expireTime.isBefore(today)) row.expireTime = null;
		}
		return regKeyList;
	},

	async consume(c, regKeyId) {
		const id = toId(regKeyId, 'regKeyId');
		const row = await orm(c).update(regKey)
			.set({ count: sql`${regKey.count} - 1` })
			.where(and(eq(regKey.regKeyId, id), gt(regKey.count, 0)))
			.returning()
			.get();
		if (!row) throw new BizError(t('noRegKeyCount'), 409);
		return row;
	},

	async restoreCount(c, regKeyId) {
		const id = toId(regKeyId, 'regKeyId');
		await orm(c).update(regKey)
			.set({ count: sql`${regKey.count} + 1` })
			.where(eq(regKey.regKeyId, id))
			.run();
	},

	async reduceCount(c, code, count = 1) {
		const row = await this.selectByCode(c, code);
		if (!row) throw new BizError(t('notExistRegKey'));
		for (let index = 0; index < count; index += 1) await this.consume(c, row.regKeyId);
	},

	async history(c, params) {
		return userService.listByRegKeyId(c, toId(params?.regKeyId, 'regKeyId'));
	}
};

export default regKeyService;

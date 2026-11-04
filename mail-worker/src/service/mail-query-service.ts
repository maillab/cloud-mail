import { and, asc, count, desc, eq, gt, lt } from 'drizzle-orm';
import accountDao from '../dao/account-dao';
import attDao from '../dao/att-dao';
import orm from '../entity/orm';
import account from '../entity/account';
import email from '../entity/email';
import { star } from '../entity/star';
import { emailConst, isDel } from '../const/entity-const';
import BizError from '../error/biz-error';
import { tFor } from '../i18n/i18n';
import { boundId } from '../lib/bound-id';
import { emailListColumns, emailBriefColumns } from '../lib/email-list-columns';
import { applyBriefListText, toListText } from '../lib/email-list-text';
import { attachListAttachments } from '../lib/email-list-attachments';
import type { EnvContext, HttpContext } from '../types/context';
import type { ScalarId } from '../types/api';
import type { EmailListQuery, MailConditions, MailListItem, MailPage, PersonalMailFilters } from '../types/email';

export async function listPersonalMail(
	c: EnvContext & { req?: Pick<HttpContext['req'], 'header'> },
	params: EmailListQuery,
	userId: ScalarId,
): Promise<MailPage> {
	const t = tFor(c);

	let { emailId, type, accountId, size, timeSort, allReceive, full } = params;

	size = Number(size);
	type = Number(type);
	emailId = Number(emailId) || 0;
	timeSort = Number(timeSort);
	accountId = Number(accountId);
	allReceive = Number(allReceive);
	full = Number(full);

	if (isNaN(type)) {
		type = 0;
	}

	if (isNaN(accountId)) {
		throw new BizError(t('emptyAccountId'));
	}

	if (isNaN(size)) {
		size = 10;
	}

	if (isNaN(full)) {
		full = 1;
	}

	full = full === 1;

	if (size > 50) {
		size = 50;
	}

	if (isNaN(allReceive)) {
		const accountRow = await accountDao.selectById(c, accountId);
		allReceive = accountRow!.allReceive;
	}

	const filters = personalListFilters({ userId, accountId, type, allReceive, emailId, timeSort });
	const countFilters = personalListFilters({ userId, accountId, type, allReceive, withCursor: false });
	const columns = full ? emailListColumns : emailBriefColumns;

	const query = orm(c)
		.select({
			...columns,
			starId: star.starId
		})
		.from(email)
		.leftJoin(
			star,
			and(
				eq(star.emailId, email.emailId),
				eq(star.userId, boundId(userId))
			)
		)
		.innerJoin(
			account,
			eq(account.accountId, email.accountId)
		)
		.where(and(...filters));

	if (timeSort) {
		query.orderBy(asc(email.emailId));
	} else {
		query.orderBy(desc(email.emailId));
	}

	const listQuery = query.limit(size).all();

	const totalQuery = orm(c).select({ total: count() }).from(email)
		.innerJoin(
			account,
			eq(account.accountId, email.accountId)
		)
		.where(and(...countFilters))
		.get();

	const latestEmailQuery = orm(c).select({
		emailId: email.emailId,
		accountId: email.accountId,
		userId: email.userId,
	}).from(email).where(
		and(
			eq(email.userId, boundId(userId)),
			eq(email.type, type),
			eq(email.isDel, isDel.NORMAL),
			allReceive ? undefined : eq(email.accountId, boundId(accountId))
		))
		.orderBy(desc(email.emailId)).limit(1).get();

	let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

	list = list.map(item => ({
		...item,
		isStar: item.starId != null ? 1 : 0
	}));

	if (full) {
		if (list.length > 0) {
			const attachments = await attDao.selectByEmailIds(c, list.map(item => item.emailId));
			attachListAttachments(list, attachments);
		}
	} else {
		applyBriefListText(list);
	}

	if (!latestEmail) {
		return { list, total: totalRow!.total, latestEmail: {
			emailId: 0,
			accountId: accountId,
			userId: userId,
		} };
	}

	return { list, total: totalRow!.total, latestEmail };
}

export async function latestPersonalMail(c: EnvContext, params: EmailListQuery, userId: ScalarId): Promise<MailListItem[]> {
	let { emailId, accountId, allReceive } = params;
	allReceive = Number(allReceive);

	if (isNaN(allReceive)) {
		const accountRow = await accountDao.selectById(c, Number(accountId));
		allReceive = accountRow!.allReceive;
	}

	const list: MailListItem[] = await orm(c).select({ ...emailListColumns }).from(email)
		.innerJoin(
			account,
			eq(account.accountId, email.accountId)
		)
		.where(
			and(
				gt(email.emailId, boundId(emailId)),
				eq(email.userId, boundId(userId)),
				eq(email.isDel, isDel.NORMAL),
				eq(account.isDel, isDel.NORMAL),
				allReceive ? undefined : eq(email.accountId, boundId(accountId)),
				eq(email.type, emailConst.type.RECEIVE)
			))
		.orderBy(desc(email.emailId))
		.limit(20);

	if (list.length > 0) {
		const attachments = await attDao.selectByEmailIds(c, list.map(item => item.emailId));
		attachListAttachments(list, attachments);
	}
	for (const item of list) {
		item.listText = toListText(item);
	}
	return list;
}

function personalListFilters({ userId, accountId, type, allReceive, emailId, timeSort, withCursor = true }: PersonalMailFilters): MailConditions {
	const conditions = [
		eq(email.userId, boundId(userId)),
		eq(email.type, type),
		eq(email.isDel, isDel.NORMAL),
		eq(account.isDel, isDel.NORMAL),
	];
	if (!allReceive) {
		conditions.push(eq(email.accountId, boundId(accountId)));
	}
	if (withCursor && emailId) {
		conditions.push(timeSort ? gt(email.emailId, boundId(emailId)) : lt(email.emailId, boundId(emailId)));
	}
	return conditions;
}

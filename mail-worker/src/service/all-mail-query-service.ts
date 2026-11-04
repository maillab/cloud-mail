import { and, asc, count, desc, eq, gt, lt, or, sql } from 'drizzle-orm';
import attDao from '../dao/att-dao';
import orm from '../entity/orm';
import email from '../entity/email';
import user from '../entity/user';
import { emailConst, isDel } from '../const/entity-const';
import { boundId } from '../lib/bound-id';
import { emailListColumns, emailBriefColumns } from '../lib/email-list-columns';
import { applyBriefListText, toListText } from '../lib/email-list-text';
import { attachListAttachments } from '../lib/email-list-attachments';
import type { EnvContext } from '../types/context';
import type { ScalarId } from '../types/api';
import type { AllMailFilters, AllMailQuery, MailConditions, MailListItem, MailPage } from '../types/email';

export async function listAllMail(c: EnvContext, params: AllMailQuery): Promise<MailPage> {

	let { emailId, size, name, subject, accountEmail, userEmail, type, timeSort, full } = params;

	size = Number(size);
	emailId = Number(emailId) || 0;
	timeSort = Number(timeSort);
	full = Number(full);

	if (type === undefined) {
		type = 'receive';
	}

	if (isNaN(size)) {
		size = 10;
	}

	if (size > 50) {
		size = 50;
	}

	if (isNaN(full)) {
		full = 1;
	}

	full = full === 1;

	const filters = allMailFilters({ emailId, name, subject, accountEmail, userEmail, type, timeSort });
	const countFilters = allMailFilters({ emailId, name, subject, accountEmail, userEmail, type, timeSort, withCursor: false });
	const columns = full ? emailListColumns : emailBriefColumns;

	const query = orm(c).select({ ...columns, userEmail: user.email })
		.from(email)
		.leftJoin(user, eq(email.userId, user.userId))
		.where(and(...filters));

	// count 不搜用户时无需 join user
	const queryCount = userEmail
		? orm(c).select({ total: count() })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(and(...countFilters))
		: orm(c).select({ total: count() })
			.from(email)
			.where(and(...countFilters));

	if (timeSort) {
		query.orderBy(asc(email.emailId));
	} else {
		query.orderBy(desc(email.emailId));
	}

	const listQuery = query.limit(size).all();
	const totalQuery = queryCount.get();
	const latestEmailQuery = orm(c).select({
		emailId: email.emailId,
		accountId: email.accountId,
		userId: email.userId,
	}).from(email)
		.where(eq(email.type, emailConst.type.RECEIVE))
		.orderBy(desc(email.emailId)).limit(1).get();

	let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

	if (full) {
		if (list.length > 0) {
			const attachments = await attDao.selectByEmailIds(c, list.map(item => item.emailId));
			attachListAttachments(list, attachments);
		}
	} else {
		applyBriefListText(list);
	}

	if (!latestEmail) {
		latestEmail = {
			emailId: 0,
			accountId: 0,
			userId: 0,
		}
	}

	return { list: list, total: totalRow!.total, latestEmail };
}

export async function latestAllMail(c: EnvContext, params: { emailId?: ScalarId }): Promise<MailListItem[]> {

	const { emailId } = params;

	const list: MailListItem[] = await orm(c).select({ ...emailListColumns, userEmail: user.email }).from(email)
		.leftJoin(user, eq(email.userId, user.userId))
		.where(
			and(
				gt(email.emailId, boundId(emailId)),
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

function allMailFilters({ emailId, name, subject, accountEmail, userEmail, type, timeSort, withCursor = true }: AllMailFilters): MailConditions {
	const conditions: MailConditions = [];

	if (type === 'send') {
		conditions.push(eq(email.type, emailConst.type.SEND));
	}

	if (type === 'receive') {
		conditions.push(eq(email.type, emailConst.type.RECEIVE));
	}

	if (type === 'delete') {
		conditions.push(eq(email.isDel, isDel.DELETE));
	}

	if (type === 'noone') {
		conditions.push(eq(email.status, emailConst.status.NOONE));
	}

	if (userEmail) {
		conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${userEmail + '%'}`);
	}

	if (accountEmail) {
		conditions.push(
			or(
				sql`${email.toEmail} COLLATE NOCASE LIKE ${accountEmail + '%'}`,
				sql`${email.sendEmail} COLLATE NOCASE LIKE ${accountEmail + '%'}`,
			)
		);
	}

	if (name) {
		conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${name + '%'}`);
	}

	if (subject) {
		conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject + '%'}`);
	}

	if (withCursor && emailId) {
		conditions.push(timeSort ? gt(email.emailId, boundId(emailId)) : lt(email.emailId, boundId(emailId)));
	}

	return conditions;
}

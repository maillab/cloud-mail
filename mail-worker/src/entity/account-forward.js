import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const accountForward = sqliteTable('account_forward', {
	forwardId: integer('forward_id').primaryKey({ autoIncrement: true }),
	accountId: integer('account_id').notNull(),
	userId: integer('user_id').notNull(),
	targetEmail: text('target_email').notNull(),
	status: integer('status').default(0).notNull(),
	verifyCode: text('verify_code').default('').notNull(),
	verifyExpireTime: text('verify_expire_time'),
	verifySendTime: text('verify_send_time'),
	verifyFailCount: integer('verify_fail_count').default(0).notNull(),
	failCount: integer('fail_count').default(0).notNull(),
	lastError: text('last_error').default('').notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`),
});
export default accountForward

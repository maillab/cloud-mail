import { sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const role = sqliteTable('role', {
	roleId: integer('role_id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	// Legacy init inserts the default role without a key; keep its NULL readable.
	key: text('key').$type<string | null>().notNull(),
	description: text('description'),
	banEmail: text('ban_email').notNull().default(''),
	banEmailType: integer('ban_email_type').notNull().default(0),
	availDomain: text('avail_domain').default(''),
	sort: integer('sort'),
	isDefault: integer('is_default').default(0),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	userId: integer('user_id'),
	sendCount: integer('send_count'),
	sendType: text('send_type').default('count'),
	accountCount: integer('account_count')
});
export default role

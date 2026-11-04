import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const regKey = sqliteTable('reg_key', {
	regKeyId: integer('rege_key_id').primaryKey({ autoIncrement: true }),
	code: text('code').notNull().default(''),
	count: integer('count').notNull().default(0),
	roleId: integer('role_id').notNull().default(0),
	userId: integer('user_id').notNull().default(0),
	expireTime: text('expire_time'),
	createTime: text('create_time').notNull().default(sql`CURRENT_TIMESTAMP`)
});
export default regKey

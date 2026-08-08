import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const deviceToken = sqliteTable('device_token', {
	tokenId: integer('token_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	deviceToken: text('device_token').notNull(),
	platform: text('platform').default('ios').notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const oauth = sqliteTable('oauth', {
	oauthId: integer('oauth_id').primaryKey({ autoIncrement: true }),
	oauthUserId: text('oauth_user_id'),
	username: text('username'),
	name: text('name'),
	avatar: text('avatar'),
	active: integer('active'),
	trustLevel: integer('trust_level'),
	silenced: integer('silenced'),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	// Legacy DDL defaults to numeric 0; current providers write strings.
	platform: text('platform').$type<string | number>(),
	userId: integer('user_id').default(0).notNull()
});


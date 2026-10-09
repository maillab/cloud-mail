import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const passkey = sqliteTable('passkey', {
	passkeyId: integer('passkey_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	credentialId: text('credential_id').notNull().unique(),
	publicKey: text('public_key').notNull(),
	counter: integer('counter').notNull().default(0),
	transports: text('transports').default('[]'),
	name: text('name').default(''),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`),
	lastUsedTime: text('last_used_time'),
	isDel: integer('is_del').default(0).notNull()
});

export default passkey;

import { sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const email = sqliteTable('verify_record', {
	vrId: integer('vr_id').primaryKey({ autoIncrement: true }),
	ip: text('ip').notNull().default(''),
	count: integer('count').notNull().default(1),
	type: integer('type').notNull().default(0),
	updateTime: text('update_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export default email

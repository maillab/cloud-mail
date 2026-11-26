import { sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const account = sqliteTable('account', {
	accountId: integer('account_id').primaryKey({ autoIncrement: true }),
	email: text('email').notNull(),
	name: text('name').notNull().default(''),
	status: integer('status').default(0).notNull(),
	latestEmailTime: text('latest_email_time'),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`),
	userId: integer('user_id').notNull(),
	allReceive: integer('all_receive').default(0).notNull(),
	sort: integer('sort').default(0).notNull(),
	isDel: integer('is_del').default(0).notNull(),
	signatureImageKey: text('signature_image_key'),
	// The downscaled asset actually embedded in outgoing mail. The master is kept
	// only so the image can be replaced or re-derived later.
	signatureDeliveryKey: text('signature_delivery_key'),
	signatureText: text('signature_text').default('').notNull(),
	signature: text('signature').default('').notNull(),
	signatureEnabled: integer('signature_enabled').default(1).notNull(),
	signatureReplyEnabled: integer('signature_reply_enabled').default(1).notNull(),
	// 'personal' = one team member's own address; 'shared' = an operational
	// company address (support@, legal@ …) that several members work.
	mailboxType: text('mailbox_type').default('personal').notNull(),
	displayName: text('display_name').default('').notNull(),
	mailboxStatus: text('mailbox_status').default('active').notNull(),
	inboundState: text('inbound_state').default('unknown').notNull(),
	outboundState: text('outbound_state').default('unknown').notNull(),
	healthCheckedAt: text('health_checked_at'),
});
export default account

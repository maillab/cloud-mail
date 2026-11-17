import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// 浏览器 Web Push 订阅（iOS 主屏幕 Web App、桌面浏览器等），一台设备一条，endpoint 唯一。
export const pushSubscription = sqliteTable('push_subscription', {
	subscriptionId: integer('subscription_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	// 订阅时的登录会话；会话失效（登出、改密、封禁）后不再向该设备推送。
	token: text('token').default('').notNull(),
	endpoint: text('endpoint').notNull(),
	p256dh: text('p256dh').notNull(),
	auth: text('auth').notNull(),
	// 订阅时站点的 origin，用来拼通知点击后打开的地址。
	origin: text('origin').default('').notNull(),
	createTime: text('create_time')
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
});

// VAPID 密钥，全站只有 id = 1 一行，首次使用时自动生成。
export const pushVapid = sqliteTable('push_vapid', {
	id: integer('id').primaryKey(),
	publicKey: text('public_key').notNull(),
	privateKey: text('private_key').notNull(),
});

export default pushSubscription;

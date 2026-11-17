import orm from '../entity/orm';
import { pushSubscription, pushVapid } from '../entity/push-subscription';
import { and, desc, eq, inArray } from 'drizzle-orm';
import BizError from '../error/biz-error';
import KvConst from '../const/kv-const';
import userContext from '../security/user-context';
import { t } from '../i18n/i18n';
import emailUtils from '../utils/email-utils';
import { generateVapidKeys, isValidSubscriptionKeys, sendWebPush } from '../push/web-push';

// 每个用户最多保留的设备订阅数，超出后淘汰最早的。
const MAX_SUBSCRIPTIONS = 20;

// 只允许向已知的浏览器推送服务发请求，避免订阅地址被用来让 Worker 请求任意站点。
const PUSH_HOSTS = [
	'push.apple.com',					// Safari（iOS / iPadOS / macOS）
	'fcm.googleapis.com',				// Chrome / Edge / Android
	'push.services.mozilla.com',		// Firefox
	'notify.windows.com'				// 旧版 Edge
];

function isAllowedEndpoint(endpoint) {
	if (typeof endpoint !== 'string' || endpoint.length > 1024) {
		return false;
	}
	try {
		const url = new URL(endpoint);
		return url.protocol === 'https:' && PUSH_HOSTS.some(host => url.hostname === host || url.hostname.endsWith('.' + host));
	} catch {
		return false;
	}
}

// 订阅请求来自哪个站点（开发时前端和 Worker 不同源，优先取 Origin 头）。
function requestOrigin(c) {
	try {
		const url = new URL(c.req.header('Origin') || c.req.url);
		return ['https:', 'http:'].includes(url.protocol) ? url.origin : '';
	} catch {
		return '';
	}
}

// 推送表不存在：老版本升级后还没执行过 /init。drizzle 可能把 D1 的报错包在 cause 里，两处都看。
function isMissingTable(e) {
	return [e?.message, e?.cause?.message].some(message => message?.includes('no such table'));
}

function clip(value, max) {
	const str = String(value ?? '').replace(/\s+/g, ' ').trim();
	return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

const pushService = {

	// 建表语句全部幂等，/init 的迁移和下面的按需建表共用这一份。
	async createTables(c) {
		await c.env.db.batch([
			c.env.db.prepare(`
				CREATE TABLE IF NOT EXISTS push_subscription (
					subscription_id INTEGER PRIMARY KEY AUTOINCREMENT,
					user_id INTEGER NOT NULL,
					token TEXT NOT NULL DEFAULT '',
					endpoint TEXT NOT NULL,
					p256dh TEXT NOT NULL,
					auth TEXT NOT NULL,
					origin TEXT NOT NULL DEFAULT '',
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
				)
			`),
			c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscription_endpoint ON push_subscription(endpoint)`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_push_subscription_user ON push_subscription(user_id)`),
			c.env.db.prepare(`
				CREATE TABLE IF NOT EXISTS push_vapid (
					id INTEGER PRIMARY KEY,
					public_key TEXT NOT NULL,
					private_key TEXT NOT NULL
				)
			`)
		]);
	},

	// 已有部署更新代码后不一定会再执行 /init，所以用户第一次开启通知时发现表不存在就直接建表再重试，
	// 不要求管理员先手动升级数据库。
	async withTables(c, action) {
		try {
			return await action();
		} catch (e) {
			if (!isMissingTable(e)) {
				throw e;
			}
			await this.createTables(c);
			return await action();
		}
	},

	// 取 VAPID 密钥，没有就生成。INSERT OR IGNORE 保证并发时只有一份生效，
	// 密钥一旦变化，之前的所有订阅都会失效。
	async vapidKeys(c) {
		const query = () => orm(c).select().from(pushVapid).where(eq(pushVapid.id, 1)).get();
		const row = await query();
		if (row) {
			return row;
		}
		const keys = await generateVapidKeys();
		await orm(c).insert(pushVapid).values({ id: 1, ...keys }).onConflictDoNothing().run();
		return query();
	},

	async publicKey(c) {
		const { publicKey } = await this.withTables(c, () => this.vapidKeys(c));
		return { publicKey };
	},

	// 保存（或更新）当前设备的订阅，并绑定到当前登录会话。
	// 返回服务端公钥，前端据此判断本地订阅是否需要用新密钥重建。
	async subscribe(c, params, userId) {
		return this.withTables(c, () => this.saveSubscription(c, params, userId));
	},

	async saveSubscription(c, params, userId) {
		const endpoint = params?.endpoint;
		const p256dh = params?.keys?.p256dh;
		const auth = params?.keys?.auth;

		if (!isAllowedEndpoint(endpoint) || !isValidSubscriptionKeys(p256dh, auth)) {
			throw new BizError(t('pushSubInvalid'));
		}

		const { publicKey } = await this.vapidKeys(c);
		const row = {
			userId,
			token: await userContext.getToken(c) || '',
			p256dh,
			auth,
			origin: requestOrigin(c)
		};

		// 同一设备换了账号登录时，endpoint 不变，订阅直接转给新用户。
		await orm(c).insert(pushSubscription)
			.values({ endpoint, ...row })
			.onConflictDoUpdate({ target: pushSubscription.endpoint, set: row })
			.run();

		const overflow = await orm(c).select({ subscriptionId: pushSubscription.subscriptionId })
			.from(pushSubscription)
			.where(eq(pushSubscription.userId, userId))
			.orderBy(desc(pushSubscription.subscriptionId))
			.limit(MAX_SUBSCRIPTIONS)
			.offset(MAX_SUBSCRIPTIONS)
			.all();
		await this.removeByIds(c, overflow.map(item => item.subscriptionId));

		return { publicKey };
	},

	async unsubscribe(c, params, userId) {
		if (!params?.endpoint) {
			return;
		}
		try {
			await orm(c).delete(pushSubscription).where(
				and(
					eq(pushSubscription.userId, userId),
					eq(pushSubscription.endpoint, params.endpoint)))
				.run();
		} catch (e) {
			// 表都没有，自然没有订阅可删
			if (!isMissingTable(e)) {
				throw e;
			}
		}
	},

	// 登出时清掉这个会话下的订阅，前端取消订阅失败也不会继续收到推送。
	async removeByToken(c, userId, token) {
		if (!token) {
			return;
		}
		try {
			await orm(c).delete(pushSubscription).where(
				and(
					eq(pushSubscription.userId, userId),
					eq(pushSubscription.token, token)))
				.run();
		} catch (e) {
			// 清理失败（包括推送表还没建）不能让登出失败
			if (!isMissingTable(e)) {
				console.warn(`清理推送订阅失败：${e.message}`);
			}
		}
	},

	async removeByUserIds(c, userIds) {
		if (!userIds?.length) {
			return;
		}
		try {
			await orm(c).delete(pushSubscription).where(inArray(pushSubscription.userId, userIds)).run();
		} catch (e) {
			// 同上，不能让删除用户失败
			if (!isMissingTable(e)) {
				console.warn(`清理推送订阅失败：${e.message}`);
			}
		}
	},

	async removeByIds(c, subscriptionIds) {
		if (!subscriptionIds?.length) {
			return;
		}
		await orm(c).delete(pushSubscription).where(inArray(pushSubscription.subscriptionId, subscriptionIds)).run();
	},

	// 新邮件入库后，推送给收件用户的所有设备。
	async sendNewMail(c, emailRow) {
		const userId = emailRow?.userId;
		if (!userId) {
			return;
		}

		let list;
		try {
			list = await orm(c).select().from(pushSubscription).where(eq(pushSubscription.userId, userId)).all();
		} catch (e) {
			// 还没有任何人开启过通知（表未建），收信时不用建表也不用报错
			if (isMissingTable(e)) {
				return;
			}
			throw e;
		}
		if (list.length === 0) {
			return;
		}

		// 只推给登录会话仍然有效的设备，其余订阅直接清理。
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
		const tokens = authInfo?.tokens || [];
		const active = list.filter(item => tokens.includes(item.token));
		const expired = list.filter(item => !tokens.includes(item.token)).map(item => item.subscriptionId);

		if (active.length > 0) {
			const vapid = await this.vapidKeys(c);
			const results = await Promise.all(active.map(item => this.send(c, item, emailRow, vapid)));
			results.forEach((gone, index) => {
				if (gone) {
					expired.push(active[index].subscriptionId);
				}
			});
		}

		await this.removeByIds(c, expired);
	},

	// 发送单条推送。返回 true 表示推送服务确认该订阅已失效（用户删除了 App 或关闭了通知权限）。
	async send(c, subscription, emailRow, vapid) {
		const title = clip(emailRow.name || emailRow.sendEmail, 80) || 'Cloud Mail';
		// 通知正文分两行：第一行主题，第二行正文摘要（系统会按可显示的行数自行截断）。
		// 识别出验证码时放在主题最前面，锁屏上就能直接看到。
		const subject = clip(emailRow.code ? `[${emailRow.code}] ${emailRow.subject || ''}` : emailRow.subject, 120);
		let preview = '';
		try {
			preview = clip(emailUtils.formatText(emailRow.text) || emailUtils.htmlToText(emailRow.content), 160);
		} catch (e) {
			// 摘要提取失败不影响推送，只发主题
			console.warn(`提取推送摘要失败：${e.message}`);
		}
		const body = [subject, preview].filter(Boolean).join('\n');

		// 负载采用 Declarative Web Push 格式：iOS / iPadOS 18.4+ 由系统直接展示通知，不依赖 Service Worker 被唤醒；
		// 其它浏览器会当作普通 JSON 交给 Service Worker 的 push 事件（public/push-sw.js）展示。
		// navigate 必须是绝对地址，拿不到 origin 时不带，退回 Service Worker 处理。
		const notification = {
			title,
			body,
			tag: `mail-${emailRow.emailId}`,
			data: { emailId: emailRow.emailId, accountId: emailRow.accountId }
		};
		if (subscription.origin) {
			notification.navigate = subscription.origin + '/';
		}
		const payload = JSON.stringify({ web_push: 8030, notification });

		// VAPID 的 sub 是推送服务联系站点管理员用的地址。
		const contact = c.env.admin ? `mailto:${c.env.admin}` : (subscription.origin || 'mailto:admin@example.com');

		try {
			const res = await sendWebPush(subscription, payload, vapid, contact);
			if (res.status === 404 || res.status === 410) {
				return true;
			}
			if (!res.ok) {
				console.error(`web push failed: ${res.status} ${new URL(subscription.endpoint).hostname} ${clip(await res.text(), 200)}`);
			}
		} catch (e) {
			console.error('web push error', e);
		}
		return false;
	}
};

export default pushService;

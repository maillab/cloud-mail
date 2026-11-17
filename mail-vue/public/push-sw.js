// Web Push 处理，由 vite-plugin-pwa 生成的 sw.js 通过 importScripts 引入（见 vite.config.js）。
// 负载格式见 mail-worker/src/service/push-service.js：{ web_push: 8030, notification: { title, body, tag, navigate, data } }
// iOS / iPadOS 18.4+ 会按 Declarative Web Push 由系统直接展示，不会走到这里；其它浏览器和旧版 iOS 由下面的 push 事件展示。

self.addEventListener('push', (event) => {
	let payload = {};
	try {
		payload = event.data ? event.data.json() : {};
	} catch {
		payload = {};
	}

	const notification = payload.notification || {};

	// 每条推送都必须展示通知：Safari 对收到推送却不展示的订阅会直接吊销。
	event.waitUntil(
		self.registration.showNotification(notification.title || 'Cloud Mail', {
			body: notification.body || '',
			tag: notification.tag,
			icon: new URL('mail-pwa.png', self.registration.scope).href,
			data: { url: notification.navigate || self.registration.scope }
		})
	);
});

// 点击通知：App 已打开就切回前台（收件箱会通过 WebSocket 自己刷新），否则打开 App。
self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = event.notification.data?.url || self.registration.scope;

	event.waitUntil((async () => {
		const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
		const client = clients.find(item => item.url.startsWith(self.registration.scope));
		if (client) {
			await client.focus();
			return;
		}
		await self.clients.openWindow(url);
	})());
});

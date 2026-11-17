import pushService from '../service/push-service';

// 新邮件入库后向收件用户的设备发 Web Push（iOS 主屏幕 Web App、桌面浏览器等）。
// 无人收件（userId 为 0）不推。失败不影响收信，用 waitUntil 挂到当前 Worker 生命周期。
export function notifyMailPush(env, ctx, emailRow) {
	if (!env?.db || !emailRow?.userId) {
		return;
	}

	const task = pushService.sendNewMail({ env }, emailRow).catch(err => {
		console.error('web push notify failed', err);
	});

	if (ctx && typeof ctx.waitUntil === 'function') {
		ctx.waitUntil(task);
	} else {
		void task;
	}
}

// Hono 请求里取 executionCtx 再推送（站内互发走 HTTP，没有独立的 email handler ctx）。
export function notifyMailPushFromContext(c, emailRow) {
	let ctx;
	try {
		ctx = c.executionCtx;
	} catch {
		ctx = undefined;
	}
	notifyMailPush(c.env, ctx, emailRow);
}

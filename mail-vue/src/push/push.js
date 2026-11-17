// 新邮件 Web Push 的浏览器端：申请通知权限、向推送服务订阅、把订阅交给后端。
// iOS / iPadOS 只有“添加到主屏幕”后的 Web App（16.4+）才有 Push API，在 Safari 标签页里拿不到。
import {pushPublicKey, pushSubscribe, pushUnsubscribe} from "@/request/push.js";

const SW_READY_TIMEOUT_MS = 8_000;

export const PUSH_STATE = {
	UNSUPPORTED: 'unsupported',		// 浏览器不支持
	NEED_INSTALL: 'need-install',	// iOS 上还没添加到主屏幕
	DENIED: 'denied',				// 用户拒绝了通知权限
	ON: 'on',
	OFF: 'off'
};

export function isIos() {
	// iPadOS 默认伪装成 Mac，用触摸点数区分。
	return /iPad|iPhone|iPod/.test(navigator.userAgent)
		|| (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
	return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function isPushSupported() {
	return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function base64UrlToBytes(value) {
	const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
	return Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
}

function bytesToBase64Url(buffer) {
	let str = '';
	for (const byte of new Uint8Array(buffer)) {
		str += String.fromCharCode(byte);
	}
	return btoa(str).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function getRegistration() {
	return navigator.serviceWorker.getRegistration();
}

// 订阅需要已激活的 Service Worker；开发模式下不注册 SW，超时后返回 null。
function getActiveRegistration() {
	return Promise.race([
		navigator.serviceWorker.ready,
		new Promise(resolve => setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS))
	]);
}

async function getSubscription() {
	const registration = await getRegistration();
	return await registration?.pushManager.getSubscription() || null;
}

async function createSubscription(registration, publicKey) {
	const options = {userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey)};
	try {
		return await registration.pushManager.subscribe(options);
	} catch (e) {
		// 已有订阅但用的是另一把服务端密钥时会报错，退订后重建。
		const old = await registration.pushManager.getSubscription();
		if (!old) {
			throw e;
		}
		await old.unsubscribe();
		return registration.pushManager.subscribe(options);
	}
}

// 当前设备的通知状态，取值见 PUSH_STATE。
export async function getPushState() {
	if (!isPushSupported()) {
		return isIos() && !isStandalone() ? PUSH_STATE.NEED_INSTALL : PUSH_STATE.UNSUPPORTED;
	}
	if (Notification.permission === 'denied') {
		return PUSH_STATE.DENIED;
	}
	try {
		const subscription = await getSubscription();
		return subscription && Notification.permission === 'granted' ? PUSH_STATE.ON : PUSH_STATE.OFF;
	} catch (e) {
		console.warn(e);
		return PUSH_STATE.OFF;
	}
}

// 开启通知，返回开启后的状态。必须在用户点击的回调里调用：
// iOS 要求权限弹窗由用户手势直接触发，所以 requestPermission 放在所有网络请求之前。
export async function enablePush() {
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') {
		return permission === 'denied' ? PUSH_STATE.DENIED : PUSH_STATE.OFF;
	}

	const registration = await getActiveRegistration();
	if (!registration) {
		throw new Error('Service worker is not ready');
	}

	const {publicKey} = await pushPublicKey();
	const subscription = await createSubscription(registration, publicKey);
	await pushSubscribe(subscription.toJSON());
	return PUSH_STATE.ON;
}

// 关闭通知：先让后端删掉订阅，再在浏览器退订。
export async function disablePush() {
	const subscription = await getSubscription();
	if (!subscription) {
		return;
	}
	await pushUnsubscribe(subscription.endpoint, {noMsg: true}).catch(e => console.warn(e));
	await subscription.unsubscribe();
}

// 登出 / 注销后只清本地订阅（后端在登出时已按会话删除），避免下一个登录的人接手这台设备的订阅。
export async function clearLocalPush() {
	try {
		if (!isPushSupported()) {
			return;
		}
		const subscription = await getSubscription();
		await subscription?.unsubscribe();
	} catch (e) {
		console.warn(e);
	}
}

// 进入应用时把本地已有的订阅重新交给后端：绑定到当前登录会话，
// 并处理推送服务轮换 endpoint、服务端密钥变化的情况。静默执行，失败不提示。
export async function syncPush() {
	try {
		if (!isPushSupported() || Notification.permission !== 'granted') {
			return;
		}
		const registration = await getRegistration();
		const subscription = await registration?.pushManager.getSubscription();
		if (!subscription) {
			return;
		}

		const {publicKey} = await pushSubscribe(subscription.toJSON(), {noMsg: true});
		const currentKey = subscription.options?.applicationServerKey;
		if (!currentKey || bytesToBase64Url(currentKey) === publicKey) {
			return;
		}

		// 服务端密钥变了，旧订阅已经发不出去，用新密钥重建。
		const renewed = await createSubscription(registration, publicKey);
		await pushSubscribe(renewed.toJSON(), {noMsg: true});
	} catch (e) {
		console.warn(e);
	}
}

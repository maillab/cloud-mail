// 收件箱 / 全部邮件的 WebSocket 客户端。
// 连接期间靠推送刷新列表；断开后指数退避重连（1s、2s、4s… 最长 30s），重连成功后补拉，不再按间隔轮询。
const HEARTBEAT_MS = 25_000;
const RECONNECT_MAX_MS = 30_000;
const PULL_DEBOUNCE_MS = 150;
// 与 Worker 约定：鉴权 / Origin / 全部邮件权限失败时用此关闭码，不再重连。
const CLOSE_UNAUTHORIZED = 4401;

// autoRefresh：1 关闭，其它（含 2）开启。
export function isAutoRefreshEnabled(value) {
	return Number(value) !== 1;
}

// 创建一个作用域的实时连接。
// scope=inbox 连用户 hub；scope=all-email 连共享 hub。
export function createWsClient(scope) {
	let options = null;
	let socket = null;
	let heartbeatTimer = null;
	let reconnectTimer = null;
	let pullTimer = null;
	let connected = false;
	let hasConnected = false;
	let listenersBound = false;
	let sessionToken = '';
	let authRejected = false;
	let reconnectAttempt = 0;

	// 登录后开始连接；opts.isEnabled / onMessage / onReconnect。
	function start(opts) {
		options = opts;
		hasConnected = false;
		authRejected = false;
		reconnectAttempt = 0;
		sessionToken = getToken();
		if (!listenersBound) {
			bindListeners();
			listenersBound = true;
		}
		sync();
	}

	// 离开页面或登出时关闭连接。
	function stop() {
		options = null;
		clearPullTimer();
		disconnect();
	}

	// 按自动刷新开关决定连接或断开。
	function sync() {
		if (shouldConnect()) {
			connect();
			return;
		}
		disconnect();
	}

	function shouldConnect() {
		return Boolean(options && getToken() && options.isEnabled?.() && !authRejected);
	}

	function getToken() {
		return localStorage.getItem('token') || '';
	}

	// 从 VITE_BASE_URL 拼 ws(s) 地址，token 放 query（浏览器 WebSocket 不能自定义头）。
	function getWsUrl() {
		const token = getToken();
		if (!token) {
			return '';
		}
		const base = import.meta.env.VITE_BASE_URL || '/api';
		const httpUrl = new URL(base, window.location.origin);
		const protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
		const wsUrl = new URL(`${protocol}//${httpUrl.host}/realtime`);
		wsUrl.searchParams.set('token', token);
		if (scope && scope !== 'inbox') {
			wsUrl.searchParams.set('scope', scope);
		}
		return wsUrl.toString();
	}

	function bindListeners() {
		window.addEventListener('storage', onStorageChange);
		document.addEventListener('visibilitychange', onVisibilityChange);
	}

	// 其它标签页登录/登出后，本页跟着重连或断开。
	function onStorageChange() {
		if (sessionToken === getToken()) {
			return;
		}
		sessionToken = getToken();
		authRejected = false;
		reconnectAttempt = 0;
		disconnect();
		sync();
	}

	// 标签页回到前台且未连接时尝试重连；补拉只在 onopen 里做。
	function onVisibilityChange() {
		if (document.visibilityState !== 'visible') {
			return;
		}
		if (!shouldConnect()) {
			return;
		}
		if (connected) {
			return;
		}
		connect();
	}

	function connect() {
		if (!shouldConnect() || (socket && socket.readyState !== WebSocket.CLOSED)) {
			return;
		}

		const url = getWsUrl();
		if (!url) {
			return;
		}

		clearReconnectTimer();
		try {
			socket = new WebSocket(url);
		} catch (e) {
			console.error(e);
			scheduleReconnect();
			return;
		}

		socket.onopen = () => {
			reconnectAttempt = 0;
			setConnected(true);
			sendHeartbeat();
			heartbeatTimer = window.setInterval(sendHeartbeat, HEARTBEAT_MS);
			if (hasConnected) {
				schedulePull();
			}
			hasConnected = true;
		};

		socket.onmessage = (event) => {
			if (event.data === 'pong' || typeof event.data !== 'string') {
				return;
			}
			let payload;
			try {
				payload = JSON.parse(event.data);
			} catch {
				return;
			}
			if (payload?.type === 'error') {
				authRejected = true;
				setConnected(false);
				clearHeartbeat();
				return;
			}
			if (payload?.type !== 'new_message') {
				return;
			}
			options?.onMessage?.(payload);
		};

		socket.onerror = () => {
			socket?.close();
		};

		socket.onclose = (event) => {
			clearHeartbeat();
			socket = null;
			setConnected(false);
			if (event.code === CLOSE_UNAUTHORIZED || authRejected) {
				authRejected = true;
				return;
			}
			scheduleReconnect();
		};
	}

	function disconnect() {
		clearHeartbeat();
		clearReconnectTimer();
		if (socket) {
			socket.onclose = null;
			socket.close(1000, 'client closed');
			socket = null;
		}
		setConnected(false);
	}

	// 断开后指数退避：1s、2s、4s… 封顶 30s。
	function scheduleReconnect() {
		if (!shouldConnect() || reconnectTimer) {
			return;
		}
		const delay = Math.min(1_000 * 2 ** reconnectAttempt, RECONNECT_MAX_MS);
		reconnectAttempt += 1;
		reconnectTimer = window.setTimeout(() => {
			reconnectTimer = null;
			connect();
		}, delay);
	}

	function sendHeartbeat() {
		if (socket?.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify({ type: 'ping' }));
		}
	}

	function setConnected(value) {
		connected = value;
	}

	// 重连后防抖补拉，避免漏掉断开窗口里的新信。
	function schedulePull() {
		if (!options?.onReconnect) {
			return;
		}
		clearPullTimer();
		pullTimer = window.setTimeout(() => {
			pullTimer = null;
			options?.onReconnect?.();
		}, PULL_DEBOUNCE_MS);
	}

	function clearHeartbeat() {
		if (heartbeatTimer) {
			window.clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}
	}

	function clearReconnectTimer() {
		if (reconnectTimer) {
			window.clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
	}

	function clearPullTimer() {
		if (pullTimer) {
			window.clearTimeout(pullTimer);
			pullTimer = null;
		}
	}

	// 手动刷新列表成功后：退避清零；还没连上就马上再连。
	function retryNow() {
		reconnectAttempt = 0;
		if (!shouldConnect() || connected) {
			return;
		}
		if (socket && socket.readyState !== WebSocket.CLOSED) {
			return;
		}
		clearReconnectTimer();
		connect();
	}

	return { start, stop, sync, retryNow };
}

export const inboxWs = createWsClient('inbox');
export const allEmailWs = createWsClient('all-email');

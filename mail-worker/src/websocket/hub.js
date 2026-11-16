import { DurableObject } from 'cloudflare:workers';

// 每个用户一个实例（按 userId 命名），全部邮件共用 ALL_EMAIL_HUB。
// 使用 Hibernation WebSocket：空闲可休眠，连接仍保持。
export class MailHub extends DurableObject {

	// 接受浏览器的 WebSocket 升级，接入当前 hub。
	async fetch(request) {
		if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
			return new Response('Expected WebSocket upgrade', { status: 426 });
		}

		const pair = new WebSocketPair();
		this.ctx.acceptWebSocket(pair[1]);
		return new Response(null, { status: 101, webSocket: pair[0] });
	}

	// 向本 hub 上所有连接推送新邮件摘要。出站消息不计请求。
	async notify(payload) {
		const message = JSON.stringify(payload);
		for (const socket of this.ctx.getWebSockets()) {
			try {
				socket.send(message);
			} catch {
				socket.close(1011, 'Delivery failed');
			}
		}
	}

	// 处理客户端心跳：ping / { type: 'ping' } 回 pong，避免中间代理掐线。
	async webSocketMessage(socket, message) {
		if (message === 'ping') {
			socket.send('pong');
			return;
		}
		if (typeof message !== 'string') {
			return;
		}
		try {
			const parsed = JSON.parse(message);
			if (parsed?.type === 'ping') {
				socket.send('pong');
			}
		} catch {
			// ignore malformed client frames
		}
	}

	// 客户端断开时关闭服务端套接字，便于对象休眠。
	async webSocketClose(socket, code) {
		socket.close(code, 'Durable Object is closing WebSocket');
	}
}

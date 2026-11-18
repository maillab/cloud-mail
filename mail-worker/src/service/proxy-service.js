import { parseHTML } from 'linkedom';
import settingService from './setting-service';

// 可能带远程图地址的属性；data-* 覆盖懒加载写法。
const ATTRS = ['src', 'poster', 'background', 'data-src', 'data-original', 'data-lazy-src'];

const PROXY_MEDIA_TYPES = new Set([
	'image/avif', 'image/bmp', 'image/gif', 'image/jpeg', 'image/pjpeg', 'image/png', 'image/webp',
	'image/apng', 'image/x-icon', 'image/vnd.microsoft.icon'
]);

const PROXY_IMAGE_EXTENSIONS = new Map([
	['avif', 'image/avif'], ['bmp', 'image/bmp'], ['gif', 'image/gif'],
	['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['jpe', 'image/jpeg'], ['jfif', 'image/jpeg'],
	['pjpeg', 'image/pjpeg'], ['png', 'image/png'], ['webp', 'image/webp'],
	['apng', 'image/apng'], ['ico', 'image/x-icon']
]);

const PROXY_IP_PLACEHOLDER = '192.0.2.1';
const PROXY_LINK_TTL = 3600;
const PROXY_MAX_REDIRECTS = 5;
const PROXY_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const encoder = new TextEncoder();

const proxyService = {

	// 改写单封邮件 HTML：内部读取 R2 域名，把外链图换成 /proxy?url=。
	// 不写回数据库，只影响本次查询响应。CID / data / 本站附件不改。
	async rewriteHtml(c, html) {
		if (!html) {
			return html;
		}
		const { r2Domain } = await settingService.query(c);
		return this.applyRewrite(html, this.rewriter(await this.signingKey(c.env), r2Domain), r2Domain);
	},

	// 批量改写邮件列表的 content，R2 域名只查一次。
	async rewriteList(c, list) {
		if (!list?.length) {
			return list;
		}
		const { r2Domain } = await settingService.query(c);
		const rewriteUrl = this.rewriter(await this.signingKey(c.env), r2Domain);
		for (const item of list) {
			if (!item.content) {
				continue;
			}
			item.content = await this.applyRewrite(item.content, rewriteUrl, r2Domain);
		}
		return list;
	},

	// 发出邮件前把 /proxy?url= 还原成原始外链，避免引用正文把代理地址带给收件人。
	restoreHtml(html) {
		if (!html) {
			return html;
		}
		return this.applyRestore(html);
	},

	// Worker 入口 /proxy：验签后代拉，只返回允许的图片类型。
	async fetchImage(env, params) {
		const rawUrl = params.get('url');
		const exp = params.get('exp');
		const signature = this.decodeSignature(params.get('sig'));
		if (!rawUrl || !/^[1-9]\d{0,12}$/.test(exp) || Number(exp) <= Math.floor(Date.now() / 1000) ||
			!signature) {
			return new Response(null, { status: 403 });
		}
		try {

			const key = await this.signingKey(env);
			const valid = await crypto.subtle.verify('HMAC', key, signature, this.signatureInput(rawUrl, exp));
			if (!valid) {
				return new Response(null, { status: 403 });
			}

			let target = this.proxyTarget(rawUrl);

			if (!target) {
				return new Response(null, { status: 400 });
			}

			const requestOptions = {
				redirect: 'manual',
				// 使用文档保留地址覆盖可修改的访客 IP 头。
				headers: {
					'X-Real-IP': PROXY_IP_PLACEHOLDER,
					'CF-Connecting-IP': PROXY_IP_PLACEHOLDER
				}
			};

			let res = await fetch(target.href, requestOptions);

			for (let redirects = 0; PROXY_REDIRECT_STATUSES.has(res.status); redirects++) {
				const location = res.headers.get('Location');
				await res.body?.cancel();
				if (redirects >= PROXY_MAX_REDIRECTS) {
					return new Response(null, { status: 502 });
				}
				target = this.proxyTarget(location, target);
				if (!target) {
					return new Response(null, { status: 502 });
				}
				res = await fetch(target.href, requestOptions);
			}

			if (!res.ok) {
				await res.body?.cancel();
				return new Response(null, { status: 502 });
			}

			let type = res.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();

			if (!type || type === 'application/octet-stream') {
				// 仅在响应类型缺失或通用时，按最终 URL 的路径后缀推导。
				const extension = target.pathname.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
				type = PROXY_IMAGE_EXTENSIONS.get(extension);
			}

			if (!res.body || !PROXY_MEDIA_TYPES.has(type)) {
				await res.body?.cancel();
				return new Response(null, { status: 415 });
			}

			const headers = new Headers({
				'Content-Type': type,
				'X-Content-Type-Options': 'nosniff',
				'Content-Security-Policy': "sandbox; default-src 'none'",
				'Referrer-Policy': 'no-referrer',
				'Cache-Control': 'public, max-age=3600'
			});

			const disposition = res.headers.get('Content-Disposition');
			if (disposition) {
				headers.set('Content-Disposition', disposition);
			}

			let body = res.body;
			const length = res.headers.get('Content-Length');
			const encoding = res.headers.get('Content-Encoding')?.toLowerCase();

			// Workers 从固定长度流生成 Content-Length。压缩响应的上游长度可能与解码后的内容不同。
			if (length && /^\d+$/.test(length) && Number.isSafeInteger(Number(length)) && (!encoding || encoding === 'identity')) {
				const { readable, writable } = new FixedLengthStream(Number(length));
				// 传输错误会通过 readable 传给客户端。
				body.pipeTo(writable).catch(() => {});
				body = readable;
			}

			return new Response(body, { status: res.status, headers });
		} catch {
			return new Response(null, { status: 502 });
		}
	},

	// ---------- 私有方法 ----------

	decodeSignature(sig) {
		// 32 字节的 Base64URL 签名末字符只有高 4 位有效。
		if (!sig || !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(sig)) {
			return null;
		}
		const base64 = sig.replaceAll('-', '+').replaceAll('_', '/') + '=';
		return Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
	},

	async signingKey(env) {
		if (!env.jwt_secret) {
			throw new Error('Missing jwt_secret for image proxy');
		}
		const algorithm = { name: 'HMAC', hash: 'SHA-256' };
		const root = await crypto.subtle.importKey('raw', encoder.encode(env.jwt_secret), algorithm, false, ['sign']);
		// 从现有部署密钥派生图片代理专用密钥。
		const key = await crypto.subtle.sign('HMAC', root, encoder.encode('cloud-mail/image-proxy/v1'));
		return crypto.subtle.importKey('raw', key, algorithm, false, ['sign', 'verify']);
	},

	signatureInput(url, exp) {
		return encoder.encode(JSON.stringify([url, exp]));
	},

	rewriter(key, r2Domain) {
		const exp = String(Math.floor(Date.now() / 1000) + PROXY_LINK_TTL);
		return raw => {
			const restored = this.fromProxyPath(raw);
			const url = restored || (this.shouldProxyUrl(raw, r2Domain) ? this.absoluteUrl(raw) : null);
			return url ? this.toProxyPath(url, exp, key) : null;
		};
	},

	proxyTarget(rawUrl, base) {
		if (!rawUrl?.trim()) {
			return null;
		}
		try {
			const url = new URL(rawUrl, base);
			const host = url.hostname.replace(/\.$/, '');
			if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
				return null;
			}
			// 过滤 IP 字面量和本地域名，不解析 DNS 记录。
			if (!host.includes('.') || host.startsWith('[') || /^[\d.]+$/.test(host) ||
				/\.(localhost|local|internal)$/.test(host)) {
				return null;
			}
			return url;
		} catch {
			return null;
		}
	},

	// 在生成代理链接前移除疑似追踪图：宽或高为 0，或宽高均为 1px 的外链图片。
	// 检查普通、懒加载和响应式图片来源，也识别已经改写过的代理链接。
	removeTrackingImages(document, r2Domain) {
		const isExternal = url => this.fromProxyPath(url) || this.shouldProxyUrl(url, r2Domain);
		const hasExternalImage = el => ATTRS.some(attr => isExternal(el.getAttribute(attr))) ||
			el.getAttribute('srcset')?.split(',').some(candidate => isExternal(candidate.trim().split(/\s+/, 1)[0]));

		for (const img of document.querySelectorAll('img')) {
			const width = this.imageDimension(img, 'width');
			const height = this.imageDimension(img, 'height');
			if (width !== 0 && height !== 0 && !(width === 1 && height === 1)) {
				continue;
			}

			// picture 的 source 也可能提供外链，命中后一起移除。
			const picture = img.parentElement?.localName === 'picture' ? img.parentElement : null;
			if (hasExternalImage(img) || (picture && Array.from(picture.querySelectorAll('source')).some(hasExternalImage))) {
				(picture || img).remove();
			}
		}
	},

	// 优先读取内联样式，再回退到对应的 HTML 属性。
	// 仅识别过滤规则所需的 0 和 1px，其余值返回 undefined。
	imageDimension(img, name) {
		const value = (img.style.getPropertyValue(name) || img.getAttribute(name) || '').replace(/\s*!important$/i, '').trim();
		if (/^(?:0+(?:\.0+)?|\.0+)(?:px|%)?$/i.test(value)) {
			return 0;
		}
		if (/^0*1(?:\.0+)?(?:px)?$/i.test(value)) {
			return 1;
		}
	},

	// 解析 HTML，把 img/srcset/CSS url 等外链改成带签名的同源代理地址。
	async applyRewrite(html, rewriteUrl, r2Domain) {
		const { document } = parseHTML(html);
		this.removeTrackingImages(document, r2Domain);
		const updates = [];
		const rewriteAttr = async (el, attr) => {
			const path = await rewriteUrl(el.getAttribute(attr));
			if (path) {
				el.setAttribute(attr, path);
			}
		};

		document.querySelectorAll('img,source,video,audio,track,input').forEach(el => {
			ATTRS.forEach(attr => updates.push(rewriteAttr(el, attr)));
			const srcset = el.getAttribute('srcset');
			if (srcset) {
				updates.push(this.rewriteSrcset(srcset, rewriteUrl).then(value => el.setAttribute('srcset', value)));
			}
		});

		document.querySelectorAll('[background]').forEach(el => updates.push(rewriteAttr(el, 'background')));
		document.querySelectorAll('[style]').forEach(el => {
			updates.push(this.rewriteCssUrls(el.getAttribute('style'), rewriteUrl).then(value => el.setAttribute('style', value)));
		});
		document.querySelectorAll('style').forEach(el => {
			updates.push(this.rewriteCssUrls(el.textContent, rewriteUrl).then(value => { el.textContent = value; }));
		});

		await Promise.all(updates);
		return document.toString();
	},

	// 把正文里的 /proxy?url= 还原成原始地址。
	applyRestore(html) {
		const { document } = parseHTML(html);
		const restoreAttr = (el, attr) => {
			const original = this.fromProxyPath(el.getAttribute(attr));
			if (original) {
				el.setAttribute(attr, original);
			}
		};

		document.querySelectorAll('img,source,video,audio,track,input').forEach(el => {
			ATTRS.forEach(attr => restoreAttr(el, attr));
			const srcset = el.getAttribute('srcset');
			if (srcset) {
				el.setAttribute('srcset', this.restoreSrcset(srcset));
			}
		});

		document.querySelectorAll('[background]').forEach(el => restoreAttr(el, 'background'));
		document.querySelectorAll('[style]').forEach(el => {
			el.setAttribute('style', this.restoreCssUrls(el.getAttribute('style')));
		});
		document.querySelectorAll('style').forEach(el => {
			el.textContent = this.restoreCssUrls(el.textContent);
		});

		return document.toString();
	},

	// 拼浏览器可直接请求的签名代理地址。
	async toProxyPath(url, exp, key) {
		const signature = await crypto.subtle.sign('HMAC', key, this.signatureInput(url, exp));
		const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
			.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
		return '/proxy?' + new URLSearchParams({ url, exp, sig });
	},

	// 从新旧代理链接中还原原图地址，兼容编辑器输出的相对地址。
	fromProxyPath(raw) {
		if (!raw || !String(raw).includes('proxy?')) {
			return null;
		}
		try {
			const path = new URL(raw, 'https://proxy.invalid/');
			if (path.pathname !== '/proxy') {
				return null;
			}
			const original = path.searchParams.get('url');
			return /^https?:\/\//i.test(original || '') ? original : null;
		} catch {
			return null;
		}
	},

	// 协议相对地址 //cdn.example/a.png 补成 https:。
	absoluteUrl(value) {
		const trimmed = String(value).trim();
		if (trimmed.startsWith('//')) {
			return 'https:' + trimmed;
		}
		return trimmed;
	},

	// 只代理 http(s) 外链；跳过 CID、data/blob、本站附件、已代理地址、自有 R2。
	shouldProxyUrl(raw, r2Domain) {
		if (!raw) {
			return false;
		}
		const value = String(raw).trim();
		if (!value || value.startsWith('{{domain}}') || /^(data:|blob:|cid:)/i.test(value)) {
			return false;
		}
		if (value.includes('proxy?url=')) {
			return false;
		}
		if (value.startsWith('//')) {
			return this.shouldProxyUrl('https:' + value, r2Domain);
		}
		if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
			return false;
		}

		let parsed;
		try {
			parsed = new URL(value);
		} catch {
			return false;
		}
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			return false;
		}
		const origin = this.r2Origin(r2Domain);
		return !(origin && parsed.origin === origin);
	},

	// 改写 srcset 里每一段 URL，保留 1x / 2x 等描述符。
	async rewriteSrcset(srcset, rewriteUrl) {
		const parts = await Promise.all(String(srcset).split(',').map(async part => {
			const bits = part.trim().split(/\s+/);
			const path = await rewriteUrl(bits[0]);
			if (path) {
				bits[0] = path;
			}
			return bits.join(' ');
		}));
		return parts.join(', ');
	},

	// 还原 srcset 里每一段代理地址。
	restoreSrcset(srcset) {
		return String(srcset).split(',').map(part => {
			const bits = part.trim().split(/\s+/);
			const original = this.fromProxyPath(bits[0]);
			if (original) {
				bits[0] = original;
			}
			return bits.join(' ');
		}).join(', ');
	},

	// 改写 style / <style> 中的 url(...)，一般是背景图。
	async rewriteCssUrls(css, rewriteUrl) {
		if (!css) {
			return css;
		}
		const pattern = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
		const paths = await Promise.all(Array.from(css.matchAll(pattern), match => rewriteUrl(match[2])));
		let index = 0;
		return css.replace(pattern, (match, quote) => {
			const path = paths[index++];
			return path ? 'url(' + quote + path + quote + ')' : match;
		});
	},

	// 还原 CSS url(...) 里的代理地址。
	restoreCssUrls(css) {
		if (!css) {
			return css;
		}
		return String(css).replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, quote, url) => {
			const original = this.fromProxyPath(url);
			if (!original) {
				return match;
			}
			return `url(${quote}${original}${quote})`;
		});
	},

	// 把配置里的 R2 域名收成 origin，用来识别自有对象存储上的图。
	r2Origin(r2Domain) {
		if (!r2Domain) {
			return '';
		}
		try {
			const withScheme = /^https?:\/\//i.test(r2Domain) ? r2Domain : `https://${r2Domain}`;
			return new URL(withScheme).origin;
		} catch {
			return '';
		}
	}
};

export default proxyService;

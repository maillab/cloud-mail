import { parseHTML } from 'linkedom';
import settingService from './setting-service';

// 可能带远程图地址的属性；data-* 覆盖懒加载写法。
const ATTRS = ['src', 'poster', 'background', 'data-src', 'data-original', 'data-lazy-src'];

const proxyService = {

	// 改写单封邮件 HTML：内部读取 R2 域名，把外链图换成 /proxy?url=。
	// 不写回数据库，只影响本次查询响应。CID / data / 本站附件不改。
	async rewriteHtml(c, html) {
		if (!html) {
			return html;
		}
		const { r2Domain } = await settingService.query(c);
		return this.applyRewrite(html, r2Domain);
	},

	// 批量改写邮件列表的 content，R2 域名只查一次。
	async rewriteList(c, list) {
		if (!list?.length) {
			return list;
		}
		const { r2Domain } = await settingService.query(c);
		for (const item of list) {
			if (!item.content) {
				continue;
			}
			item.content = this.applyRewrite(item.content, r2Domain);
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

	// Worker 入口 /proxy：代拉远程资源并流式返回，Content-Type 用对方的。
	async fetchImage(rawUrl) {
		const res = await fetch(new URL(rawUrl).toString(), { redirect: 'follow' });
		const headers = new Headers();
		// 对方有的头才带上：类型、大小、文件名（Content-Disposition）。
		for (const name of ['content-type', 'content-length', 'content-disposition']) {
			const value = res.headers.get(name);
			if (value) {
				headers.set(name, value);
			}
		}
		if (res.ok) {
			headers.set('Cache-Control', 'public, max-age=86400');
		}
		return new Response(res.body, { status: res.status, headers });
	},

	// ---------- 私有方法 ----------

	// 解析 HTML，把 img/srcset/CSS url 等外链改成同源 /proxy?url=。
	applyRewrite(html, r2Domain) {
		const { document } = parseHTML(html);
		const rewriteAttr = (el, attr) => {
			const value = el.getAttribute(attr);
			const restored = this.fromProxyPath(value);
			if (restored) {
				el.setAttribute(attr, this.toProxyPath(restored));
				return;
			}
			if (!this.shouldProxyUrl(value, r2Domain)) {
				return;
			}
			el.setAttribute(attr, this.toProxyPath(this.absoluteUrl(value)));
		};

		document.querySelectorAll('img,source,video,audio,track,input').forEach(el => {
			ATTRS.forEach(attr => rewriteAttr(el, attr));
			const srcset = el.getAttribute('srcset');
			if (srcset) {
				el.setAttribute('srcset', this.rewriteSrcset(srcset, r2Domain));
			}
		});

		document.querySelectorAll('[background]').forEach(el => rewriteAttr(el, 'background'));
		document.querySelectorAll('[style]').forEach(el => {
			el.setAttribute('style', this.rewriteCssUrls(el.getAttribute('style'), r2Domain));
		});
		document.querySelectorAll('style').forEach(el => {
			el.textContent = this.rewriteCssUrls(el.textContent, r2Domain);
		});

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

	// 拼浏览器可直接请求的代理地址。
	toProxyPath(url) {
		return '/proxy?url=' + encodeURIComponent(url);
	},

	// 从 proxy?url=编码地址 解出原始 URL。编辑器可能去掉开头的 /，带站点域名也可以。
	fromProxyPath(raw) {
		if (!raw) {
			return null;
		}
		const value = String(raw).trim();
		const marker = 'proxy?url=';
		const idx = value.indexOf(marker);
		if (idx === -1) {
			return null;
		}
		try {
			return decodeURIComponent(value.slice(idx + marker.length));
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
	rewriteSrcset(srcset, r2Domain) {
		return String(srcset).split(',').map(part => {
			const bits = part.trim().split(/\s+/);
			if (!bits[0]) {
				return part;
			}
			const restored = this.fromProxyPath(bits[0]);
			if (restored) {
				bits[0] = this.toProxyPath(restored);
				return bits.join(' ');
			}
			if (this.shouldProxyUrl(bits[0], r2Domain)) {
				bits[0] = this.toProxyPath(this.absoluteUrl(bits[0]));
			}
			return bits.join(' ');
		}).join(', ');
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
	rewriteCssUrls(css, r2Domain) {
		if (!css) {
			return css;
		}
		return String(css).replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, quote, url) => {
			const trimmed = String(url || '').trim();
			const restored = this.fromProxyPath(trimmed);
			if (restored) {
				return `url(${quote}${this.toProxyPath(restored)}${quote})`;
			}
			if (!this.shouldProxyUrl(trimmed, r2Domain)) {
				return match;
			}
			return `url(${quote}${this.toProxyPath(this.absoluteUrl(trimmed))}${quote})`;
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

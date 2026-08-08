import { parseHTML } from 'linkedom';
import domainUtils from '../utils/domain-uitls';
import { sanitizeEmailHtml } from '../utils/html-utils';

export default function emailHtmlTemplate(sourceHtml, domain) {
	const objectBase = domainUtils.toOssDomain(domain) || '';
	const replaced = String(sourceHtml || '').replace(/{{domain}}/g, objectBase ? `${objectBase}/` : '/');
	const sanitized = sanitizeEmailHtml(replaced);
	const { document } = parseHTML(sanitized);
	const body = document.querySelector('body');
	const content = body ? body.innerHTML : sanitized;
	return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html,body{margin:0;padding:0;background:#fff;color:#13181d;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;word-break:break-word}
.content{padding:15px 10px;overflow:auto}
img{max-width:100%;height:auto}a{color:#0e70df}
</style>
</head>
<body><main class="content">${content}</main></body>
</html>`;
}

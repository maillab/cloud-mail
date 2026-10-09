import r2Service from '../service/r2-service';
import app from '../hono/hono';
import fileUtils from '../utils/file-utils';

// 这个路由必须是**匿名可访问**的。
//
// 原因：邮件正文里的内嵌图片、以及附件下载，都是浏览器直接发起的 `<img src>` /
// `<a href download>` 请求，浏览器不会给这类请求带 Authorization 头。
// 一旦这里要求登录态，所有内嵌图片和附件下载都会 401。
//
// 残余风险与正确解法：对象名曾是"内容哈希"，属于可推导的能力 URL ——
// 知道内容就能推出地址。为此附件/内嵌图片的对象名已改为不可推导的随机数
// （见 fileUtils.genObjectName），存在性探针已失效。
// 想进一步收紧需要改成短期签名 URL（前端带签名参数、后端校验签名与有效期），
// 那是一次前后端一起动的改造，本轮未做。
app.get('/oss/*', async (c) => {
	const key = c.req.path.split('/oss/')[1];

	if (!key) {
		return c.text('Not Found', 404);
	}

	const obj = await r2Service.getObj(c, key);

	if (!obj || obj.status === 404) {
		return c.text('Not Found', 404);
	}

	// 三种存储后端返回的对象形态不一样：KV/S3 是 Response（头在 headers 上），
	// R2 是 R2ObjectBody（头在 httpMetadata 上）。这里统一取一次 ——
	// 只读 httpMetadata 的话，KV/S3 下 Content-Type 会退化成 octet-stream，
	// 邮件里的内嵌图片就渲染不出来了。
	const contentType = obj.httpMetadata?.contentType
		|| obj.headers?.get('Content-Type')
		|| 'application/octet-stream';

	const rawDisposition = obj.httpMetadata?.contentDisposition
		|| obj.headers?.get('Content-Disposition');

	// HTML/SVG 一律强制下载，避免在本站 origin 下被当作页面执行（存储型 XSS）
	const contentDisposition = fileUtils.isDangerousInlineType(contentType)
		? 'attachment'
		: rawDisposition;

	const headers = new Headers({
		'Content-Type': contentType,
		'X-Content-Type-Options': 'nosniff'
	});
	if (contentDisposition) headers.set('Content-Disposition', contentDisposition);

	return new Response(obj.body, { headers });
});

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
	const resp = await r2Service.toObjResp(c, key);
	if (!resp) {
		return c.notFound();
	}
	// fork 安全加固（保留）：HTML/SVG 一律强制下载，避免在本站 origin 下被当作页面执行（存储型 XSS）
	const contentType = resp.headers.get('Content-Type') || 'application/octet-stream';
	if (fileUtils.isDangerousInlineType(contentType)) {
		const headers = new Headers(resp.headers);
		headers.set('Content-Disposition', 'attachment');
		headers.set('X-Content-Type-Options', 'nosniff');
		return new Response(resp.body, { headers, status: resp.status });
	}
	return resp;
});

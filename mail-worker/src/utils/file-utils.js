// 会被浏览器当作 HTML/XML 解析的类型。这类内容一旦以内联方式从本站返回，
// 就会在应用的 origin 下执行脚本。
// 攻击路径：发件人把 HTML 存成附件 → 用可推导的对象名算出地址
// → 把链接发给受害者 → 受害者点开即中招（存储型 XSS，可直接盗 token）。
const DANGEROUS_INLINE_TYPES = new Set([
	'text/html',
	'application/xhtml+xml',
	'image/svg+xml',
	'application/xml',
	'text/xml',
	'text/xsl',
	'application/xslt+xml'
]);

const fileUtils = {

	/**
	 * 该 MIME 类型以内联方式返回时是否有脚本执行风险。
	 * 返回 true 时，调用方必须强制 Content-Disposition: attachment，
	 * 否则上传的 HTML/SVG 会在本站 origin 下被当作页面执行（存储型 XSS）。
	 * 注意：octet-stream 是安全的 —— 浏览器只会下载，不会渲染。
	 */
	isDangerousInlineType(contentType) {
		if (!contentType) {
			return false;
		}
		const type = String(contentType).split(';')[0].trim().toLowerCase();
		return DANGEROUS_INLINE_TYPES.has(type);
	},

	getExtFileName(filename) {
		try {
			const index = filename.lastIndexOf('.');
			return index !== -1 ? filename.slice(index) : '';
		} catch (e) {
			return ''
		}
	},

	async getBuffHash(buff) {
		const hashBuffer = await crypto.subtle.digest('SHA-256', buff);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
	},

	/**
	 * 生成不可推导的对象名（16 字节随机数 → 32 位十六进制）。
	 *
	 * 约定：存放用户产生的私有对象（附件、内嵌图片）时用它，不要用 getBuffHash。
	 *
	 * 原因：内容哈希是"可推导的能力 URL"——对象名由文件内容唯一决定，
	 * 任何知道该文件内容的人都能算出地址形成存在性探针。
	 * /oss/* 是匿名可读的（浏览器 <img> 带不了鉴权头），所以探针真实可用。
	 *
	 * 代价：失去按内容去重，同一文件多次上传会各存一份。
	 *
	 * 例外：站点背景图（BACKGROUND_PREFIX）刻意继续用内容哈希 —— 它本来就是
	 * 对所有人公开的资源，随机化没有安全收益，反而丢掉去重。
	 */
	genObjectName() {
		const bytes = new Uint8Array(16);
		crypto.getRandomValues(bytes);
		return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
	},

	base64ToDataStr(base64) {
		return base64.split(',')[1] || base64;
	},

	base64ToUint8Array(base64) {
		const binaryStr = atob(base64);
		const len = binaryStr.length;
		const bytes = new Uint8Array(len);
		for (let i = 0; i < len; i++) {
			bytes[i] = binaryStr.charCodeAt(i);
		}
		return bytes;
	},

	/**
	 * 将 Base64 数据转换为 File 对象（自动识别 MIME 类型和文件扩展名）
	 * @param {string} base64Data 带有 data: 前缀的 base64 数据
	 * @param {string} [customFilename] 可选，传入自定义文件名（不含扩展名）
	 * @returns {File} File 对象
	 */
	base64ToFile(base64Data, customFilename) {
		const match = base64Data.match(/^data:(image|jpeg|video)\/([a-zA-Z0-9.+-]+);base64,/);
		if (!match) {
			throw new Error('Invalid base64 data format');
		}

		const type = match[1]; // image 或 video
		const ext = match[2];  // jpg, png, mp4 等
		const mimeType = `${type}/${ext}`;
		const cleanBase64 = base64Data.replace(/^data:(image|jpeg|video)\/[a-zA-Z0-9.+-]+;base64,/, '');

		const byteCharacters = atob(cleanBase64);
		const byteArrays = [];

		for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
			const slice = byteCharacters.slice(offset, offset + 1024);
			const byteNumbers = new Array(slice.length);
			for (let i = 0; i < slice.length; i++) {
				byteNumbers[i] = slice.charCodeAt(i);
			}
			byteArrays.push(new Uint8Array(byteNumbers));
		}

		const blob = new Blob(byteArrays, { type: mimeType });

		const filename = `${customFilename || `${type}_${Date.now()}`}.${ext}`;
		return new File([blob], filename, { type: mimeType });
	}
};


export default fileUtils;


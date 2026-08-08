import orm from '../entity/orm';
import { att } from '../entity/att';
import { and, eq, isNull, inArray, desc } from 'drizzle-orm';
import r2Service from './r2-service';
import constant from '../const/constant';
import fileUtils from '../utils/file-utils';
import { attConst } from '../const/entity-const';
import { parseHTML } from 'linkedom';
import { v4 as uuidv4 } from 'uuid';
import domainUtils from '../utils/domain-uitls';
import settingService from './setting-service';
import BizError from '../error/biz-error';
import { sanitizeEmailHtml } from '../utils/html-utils';
import { toId } from '../utils/input-utils';

const MAX_ATTACHMENT_COUNT = 10;
const MAX_INLINE_COUNT = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_INCOMING_COUNT = 30;

function cleanFilename(value) {
	const filename = String(value || 'attachment')
		.replace(/[\u0000-\u001F\u007F]/g, '')
		.replace(/[\\/]/g, '_')
		.trim()
		.slice(0, 180);
	return filename || 'attachment';
}

function contentDisposition(type, filename) {
	return `${type}; filename*=UTF-8''${encodeURIComponent(cleanFilename(filename))}`;
}

function byteLength(content) {
	if (!content) return 0;
	if (content instanceof ArrayBuffer) return content.byteLength;
	if (ArrayBuffer.isView(content)) return content.byteLength;
	if (typeof content === 'string') {
		const raw = content.startsWith('data:') ? (content.split(',')[1] || '') : content;
		return Math.floor(raw.replace(/\s+/g, '').length * 3 / 4);
	}
	return Number(content.byteLength || content.length || 0);
}

function validateCountAndSize(list, maxCount, label) {
	if (!Array.isArray(list)) throw new BizError(`${label}格式错误`, 400);
	if (list.length > maxCount) throw new BizError(`${label}数量不能超过${maxCount}`, 400);
	let total = 0;
	for (const item of list) {
		const size = Number(item?.size || byteLength(item?.content || item?.buff));
		if (!Number.isFinite(size) || size < 0 || size > MAX_FILE_BYTES) throw new BizError(`单个${label}不能超过10MB`, 400);
		total += size;
	}
	if (total > MAX_TOTAL_BYTES) throw new BizError(`${label}总大小不能超过25MB`, 400);
	return total;
}

const attService = {
	cleanFilename,

	validateIncomingAttachments(attachments = []) {
		return validateCountAndSize(attachments, MAX_INCOMING_COUNT, '附件');
	},

	validateOutgoingAttachments(attachments = [], inlineAttachments = []) {
		const normalSize = validateCountAndSize(attachments, MAX_ATTACHMENT_COUNT, '附件');
		const inlineSize = validateCountAndSize(inlineAttachments, MAX_INLINE_COUNT, '内嵌图片');
		if (normalSize + inlineSize > MAX_TOTAL_BYTES) throw new BizError('附件总大小不能超过25MB', 400);
	},

	async addAtt(c, attachments) {
		if (!Array.isArray(attachments) || attachments.length === 0) return;
		this.validateIncomingAttachments(attachments);
		const rows = [];
		const storedKeys = [];
		const candidateKeys = [...new Set(attachments.map(item => String(item.key || '')).filter(Boolean))];
		const existingKeys = new Set(candidateKeys.length
			? (await orm(c).select({ key: att.key }).from(att).where(inArray(att.key, candidateKeys)).all()).map(row => row.key)
			: []);
		try {
			for (const source of attachments) {
				if (!String(source.key || '').startsWith(constant.ATTACHMENT_PREFIX)) throw new BizError('附件存储路径无效', 400);
				const filename = cleanFilename(source.filename);
				const inline = !!source.contentId;
				await r2Service.putObj(c, source.key, source.content, {
					contentType: String(source.mimeType || 'application/octet-stream').slice(0, 255),
					contentDisposition: contentDisposition(inline ? 'inline' : 'attachment', filename),
					...(inline ? { cacheControl: 'max-age=259200' } : {})
				});
				storedKeys.push(source.key);
				const { content, buff, ...row } = source;
				rows.push({ ...row, filename, size: Number(source.size || byteLength(content)) });
			}
			if (rows.length) await orm(c).insert(att).values(rows).run();
		} catch (error) {
			if (storedKeys.length) {
				try { await this.batchDelete(c, [...new Set(storedKeys.filter(key => !existingKeys.has(key)))]); } catch (cleanupError) { console.error('附件回滚失败', cleanupError); }
			}
			throw error;
		}
	},

	list(c, params, userId) {
		const emailId = toId(params?.emailId, 'emailId');
		return orm(c).select().from(att).where(and(
			eq(att.emailId, emailId),
			eq(att.userId, toId(userId, 'userId')),
			eq(att.type, attConst.type.ATT),
			isNull(att.contentId)
		)).all();
	},

	async toImageUrlHtml(c, content, userId) {
		const sanitized = sanitizeEmailHtml(typeof content === 'string' ? content.slice(0, 2_000_000) : '');
		const { r2Domain } = await settingService.query(c);
		const { document } = parseHTML(sanitized || '<html><body></body></html>');
		const images = Array.from(document.querySelectorAll('img'));
		let imageDataList = [];
		let inlineBytes = 0;
		const objectDomain = domainUtils.toOssDomain(r2Domain || '');

		for (const img of images) {
			const src = img.getAttribute('src');
			if (src?.startsWith('data:image')) {
				const file = fileUtils.base64ToFile(src);
				if (!file.type?.startsWith('image/') || file.size > MAX_FILE_BYTES) {
					img.removeAttribute('src');
					continue;
				}
				inlineBytes += file.size;
				if (inlineBytes > MAX_TOTAL_BYTES || imageDataList.length >= MAX_INLINE_COUNT) throw new BizError('内嵌图片数量或大小超限', 400);
				const buffer = await file.arrayBuffer();
				const contentId = uuidv4().replace(/-/g, '');
				const filename = cleanFilename(file.name);
				const key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(buffer) + fileUtils.getExtFileName(filename);
				img.setAttribute('src', `cid:${contentId}`);
				imageDataList.push({ key, filename, mimeType: file.type, size: file.size, buff: buffer, content: fileUtils.base64ToDataStr(src), contentId });
			} else if (src && ((objectDomain && src.startsWith(`${objectDomain}/`)) || src.startsWith(constant.ATTACHMENT_PREFIX))) {
				const key = src.startsWith(constant.ATTACHMENT_PREFIX) ? src : src.replace(`${objectDomain}/`, '');
				if (!key.startsWith(constant.ATTACHMENT_PREFIX)) {
					img.removeAttribute('src');
					continue;
				}
				const contentId = uuidv4().replace(/-/g, '');
				img.setAttribute('src', `cid:${contentId}`);
				imageDataList.push({ key, contentId, type: attConst.type.EMBED });
			}

			const hasInlineWidth = img.hasAttribute('width');
			const style = img.getAttribute('style') || '';
			if (!hasInlineWidth && !/(^|\s)width\s*:\s*[^;]+/.test(style)) {
				img.setAttribute('style', `${style ? style.trim().replace(/;$/, '') + '; ' : ''}max-width: 100%;`);
			}
		}

		const keys = [...new Set(imageDataList.filter(item => !item.content).map(item => item.key))];
		const dbImages = await this.selectOneByKeys(c, keys, userId);
		for (const image of imageDataList) {
			if (image.content) continue;
			const dbImage = dbImages.find(row => row.key === image.key);
			if (!dbImage) continue;
			const object = await r2Service.getObj(c, image.key);
			if (!object) continue;
			image.size = dbImage.size;
			image.filename = cleanFilename(dbImage.filename);
			image.mimeType = dbImage.mimeType;
			image.contentType = dbImage.mimeType;
			image.content = object instanceof ArrayBuffer ? object : await object.arrayBuffer();
		}
		imageDataList = imageDataList.filter(item => item.content);
		this.validateOutgoingAttachments([], imageDataList);
		return { imageDataList, html: sanitizeEmailHtml(document.toString()) };
	},

	async saveSendAtt(c, attList, userId, accountId, emailId) {
		if (!Array.isArray(attList) || attList.length === 0) return;
		this.validateOutgoingAttachments(attList, []);
		const rows = [];
		for (const source of attList) {
			let buffer;
			try { buffer = fileUtils.base64ToUint8Array(String(source.content || '').replace(/^data:[^,]+,/, '').replace(/\s+/g, '')); }
			catch { throw new BizError('附件内容不是有效的Base64', 400); }
			if (!buffer.length || buffer.length > MAX_FILE_BYTES) throw new BizError('单个附件不能超过10MB', 400);
			const filename = cleanFilename(source.filename);
			const key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(buffer) + fileUtils.getExtFileName(filename);
			const mimeType = String(source.type || source.contentType || 'application/octet-stream').slice(0, 255);
			await r2Service.putObj(c, key, buffer, {
				contentType: mimeType,
				contentDisposition: contentDisposition('attachment', filename)
			});
			rows.push({ userId, accountId, emailId, key, size: buffer.length, filename, mimeType, type: attConst.type.ATT });
		}
		if (rows.length) await orm(c).insert(att).values(rows).run();
	},

	async saveArticleAtt(c, list, userId, accountId, emailId) {
		if (!Array.isArray(list) || list.length === 0) return;
		this.validateOutgoingAttachments([], list);
		const rows = [];
		for (const source of list) {
			const content = source.buff || source.content;
			if (!content) continue;
			const filename = cleanFilename(source.filename);
			await r2Service.putObj(c, source.key, content, {
				contentType: source.mimeType || 'application/octet-stream',
				cacheControl: 'max-age=259200',
				contentDisposition: contentDisposition('inline', filename)
			});
			rows.push({
				userId, emailId, accountId, key: source.key, filename,
				mimeType: source.mimeType || 'application/octet-stream',
				size: Number(source.size || byteLength(content)), type: attConst.type.EMBED,
				contentId: source.contentId || null
			});
		}
		if (rows.length) await orm(c).insert(att).values(rows).run();
	},

	async removeByUserIds(c, userIds) { await this.removeAttByField(c, 'user_id', userIds); },
	async removeByEmailIds(c, emailIds) { await this.removeAttByField(c, 'email_id', emailIds); },

	selectByEmailIds(c, emailIds) {
		if (!Array.isArray(emailIds) || emailIds.length === 0) return [];
		return orm(c).select().from(att).where(and(inArray(att.emailId, emailIds), eq(att.type, attConst.type.ATT))).all();
	},

	async removeAttByField(c, fieldName, fieldValues) {
		if (!['user_id', 'email_id', 'account_id'].includes(fieldName)) throw new BizError('附件删除字段无效', 400);
		if (!Array.isArray(fieldValues) || fieldValues.length === 0) return;
		const statements = [];
		for (const value of fieldValues) {
			statements.push(c.env.db.prepare(`SELECT a.key, a.att_id FROM attachments a JOIN (SELECT key FROM attachments GROUP BY key HAVING COUNT(*) = 1) t ON a.key = t.key WHERE a.${fieldName} = ?`).bind(value));
			statements.push(c.env.db.prepare(`DELETE FROM attachments WHERE ${fieldName} = ?`).bind(value));
		}
		const results = await c.env.db.batch(statements);
		const keys = [...new Set(results.flatMap(result => result.results ? result.results.map(row => row.key) : []).filter(Boolean))];
		if (keys.length) await this.batchDelete(c, keys);
	},

	async batchDelete(c, keys) {
		for (let index = 0; index < keys.length; index += 1000) await r2Service.delete(c, keys.slice(index, index + 1000));
	},

	async removeByAccountId(c, accountId) { await this.removeAttByField(c, 'account_id', [accountId]); },

	selectOneByKeys(c, keys, userId) {
		if (!Array.isArray(keys) || keys.length === 0 || !userId) return [];
		return orm(c).select().from(att)
			.where(and(inArray(att.key, keys), eq(att.userId, userId)))
			.orderBy(desc(att.attId))
			.groupBy(att.key)
			.all();
	}
};

export default attService;

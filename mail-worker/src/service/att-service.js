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
import settingService from "./setting-service";

const attService = {

	async addAtt(c, attachments) {
		// 计算新附件总大小
		const newAttachmentsSize = attachments.reduce((total, attachment) => total + attachment.size, 0);
		
		// 检查并清理旧附件
		await this.checkAndCleanOldAttachments(c, newAttachmentsSize);

		for (let attachment of attachments) {

			let metadate = {
				contentType: attachment.mimeType,
			}

			if (!attachment.contentId) {
				metadate.contentDisposition = `attachment;filename=${attachment.filename}`
			} else {
				metadate.contentDisposition = `inline;filename=${attachment.filename}`
				metadate.cacheControl = `max-age=259200`
			}

			await r2Service.putObj(c, attachment.key, attachment.content, metadate);

		}

		await orm(c).insert(att).values(attachments).run();
	},

	list(c, params, userId) {
		const { emailId } = params;

		return orm(c).select().from(att).where(
			and(
				eq(att.emailId, emailId),
				eq(att.userId, userId),
				eq(att.type, attConst.type.ATT),
				isNull(att.contentId)
			)
		).all();
	},

	async toImageUrlHtml(c, content) {

		const { r2Domain } = await settingService.query(c);

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		let imageDataList = [];

		for (const img of images) {

			//邮件正文base64图片转cid附件
			const src = img.getAttribute('src');
			if (src && src.startsWith('data:image')) {
				const file = fileUtils.base64ToFile(src);
				const buff = await file.arrayBuffer();
				const cid = uuidv4().replace(/-/g, '');
				const key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(buff) + fileUtils.getExtFileName(file.name);

				img.setAttribute('src', 'cid:' + cid);

				const attData = {};
				attData.key = key;
				attData.filename = file.name;
				attData.mimeType = file.type;
				attData.size = file.size;
				attData.buff = buff;
				attData.content = fileUtils.base64ToDataStr(src);
				attData.contentId = cid;

				imageDataList.push(attData);
			}

			//邮件正文站内图片转cid附件
			if (src && src.startsWith(domainUtils.toOssDomain(r2Domain))) {

				const cid = uuidv4().replace(/-/g, '')
				img.setAttribute('src', 'cid:' + cid);

				const attData = {};
				attData.key = src.replace(domainUtils.toOssDomain(r2Domain) + '/','');
				attData.path = src;
				attData.contentId = cid;
				attData.type = attConst.type.EMBED;
				imageDataList.push(attData);
			}

			const hasInlineWidth = img.hasAttribute('width');
			const style = img.getAttribute('style') || '';
			const hasStyleWidth = /(^|\s)width\s*:\s*[^;]+/.test(style);

			if (!hasInlineWidth && !hasStyleWidth) {
				const newStyle = (style ? style.trim().replace(/;$/, '') + '; ' : '') + 'max-width: 100%;';
				img.setAttribute('style', newStyle);
			}
		}

		//查询已有内嵌url图片信息
		const keys = [...new Set(imageDataList.filter(item => item.path).map(item => item.key))];
		const dbImageList  = await this.selectOneByKeys(c, keys);

		//设置给当前附件
		imageDataList.forEach(image => {
			dbImageList.forEach(dbImage => {
				if (image.path && (image.key === dbImage.key)) {
					image.size = dbImage.size;
					image.filename = dbImage.filename;
					image.mimeType = dbImage.mimeType;
					image.contentType = dbImage.mimeType;
				}
			})
		})

		imageDataList = imageDataList.filter(image => !image.path || image.size);

		return { imageDataList, html: document.toString() };
	},

	async saveSendAtt(c, attList, userId, accountId, emailId) {

		const attDataList = [];
		let newAttachmentsSize = 0;

		for (let att of attList) {
			att.buff = fileUtils.base64ToUint8Array(att.content);
			att.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(att.buff) + fileUtils.getExtFileName(att.filename);
			const attData = { userId, accountId, emailId };
			attData.key = att.key;
			attData.size = att.buff.length;
			newAttachmentsSize += att.buff.length;
			attData.filename = att.filename;
			attData.mimeType = att.type;
			attData.type = attConst.type.ATT;
			attDataList.push(attData);
		}

		// 检查并清理旧附件
		await this.checkAndCleanOldAttachments(c, newAttachmentsSize);

		await orm(c).insert(att).values(attDataList).run();

		for (let att of attList) {
			await r2Service.putObj(c, att.key, att.buff, {
				contentType: att.type,
				contentDisposition: `attachment;filename=${att.filename}`
			});
		}

	},

	async saveArticleAtt(c, attDataList, userId, accountId, emailId) {
		// 计算新附件总大小
		const newAttachmentsSize = attDataList.reduce((total, attData) => total + attData.size, 0);
		
		// 检查并清理旧附件
		await this.checkAndCleanOldAttachments(c, newAttachmentsSize);

		for (let attData of attDataList) {
			attData.userId = userId;
			attData.emailId = emailId;
			attData.accountId = accountId;
			attData.type = attConst.type.EMBED;
			await r2Service.putObj(c, attData.key, attData.buff, {
				contentType: attData.mimeType,
				cacheControl: `max-age=259200`,
				contentDisposition: `inline;filename=${attData.filename}`
			});
		}

		await orm(c).insert(att).values(attDataList).run();

	},

	async removeByUserIds(c, userIds) {
		await this.removeAttByField(c, 'user_id', userIds);
	},

	async removeByEmailIds(c, emailIds) {
		await this.removeAttByField(c, 'email_id', emailIds);
	},

	selectByEmailIds(c, emailIds) {
		return orm(c).select().from(att).where(
			and(
				inArray(att.emailId, emailIds),
				eq(att.type, attConst.type.ATT)
			))
			.all();
	},

	async removeAttByField(c, fieldName, fieldValues) {

		const sqlList = [];

		fieldValues.forEach(value => {

			sqlList.push(

				c.env.db.prepare(
					`SELECT a.key, a.att_id
						FROM attachments a
							   JOIN (SELECT key
									 FROM attachments
									 GROUP BY key
									 HAVING COUNT (*) = 1) t
									ON a.key = t.key
						WHERE a.${fieldName} = ?;`
					).bind(value)
			)

			sqlList.push(c.env.db.prepare(`DELETE FROM attachments WHERE ${fieldName} = ?`).bind(value))

		});

		const attListResult = await c.env.db.batch(sqlList);

		const delKeyList = attListResult.flatMap(r => r.results ? r.results.map(row => row.key) : []);

		if (delKeyList.length > 0) {
			await this.batchDelete(c, delKeyList);
		}

	},

	async batchDelete(c, keys) {
		if (!keys.length) return;

		const BATCH_SIZE = 1000;

		for (let i = 0; i < keys.length; i += BATCH_SIZE) {
			const batch = keys.slice(i, i + BATCH_SIZE);
			await r2Service.delete(c, batch);
		}

	},

	async removeByAccountId(c, accountId) {
		await this.removeAttByField(c, "account_id", [accountId])
	},

	selectOneByKeys(c, keys) {
		if (!keys || keys.length === 0) {
			return []
		}
		return orm(c).select().from(att).where(inArray(att.key, keys)).orderBy(desc(att.attId)).groupBy(att.key).all();
	},

	async getTotalSize(c) {
		const result = await c.env.db.prepare('SELECT SUM(size) as totalSize FROM attachments').run();
		return result.results[0]?.totalSize || 0;
	},

	async checkAndCleanOldAttachments(c, newAttachmentSize = 0) {
		const setting = await settingService.query(c);
		const { r2MaxSize } = setting;
		let totalSize = await this.getTotalSize(c);
		
		if (totalSize + newAttachmentSize <= r2MaxSize) {
			return;
		}
		
		// 需要删除的大小
		const needDeleteSize = (totalSize + newAttachmentSize) - r2MaxSize;
		let deletedSize = 0;
		
		// 获取最旧的附件，按创建时间排序
		const oldAttachments = await c.env.db.prepare(
			'SELECT att_id, key, size FROM attachments ORDER BY create_time ASC'
		).all();
		
		for (const attachment of oldAttachments) {
			if (deletedSize >= needDeleteSize) {
				break;
			}
			
			// 删除R2中的文件
			await r2Service.delete(c, attachment.key);
			
			// 从数据库中删除
			await c.env.db.prepare('DELETE FROM attachments WHERE att_id = ?').bind(attachment.att_id).run();
			
			deletedSize += attachment.size;
		}
	},

	async cleanExpiredAttachments(c) {
		const setting = await settingService.query(c);
		const { r2FileExpireDays } = setting;
		
		// 获取所有过期的附件
		const expiredAttachments = await c.env.db.prepare(
			"SELECT att_id, key FROM attachments WHERE create_time < DATETIME('now', ? || ' days')"
		).bind(-r2FileExpireDays).all();
		
		for (const attachment of expiredAttachments.results) {
			// 删除R2中的文件
			await r2Service.delete(c, attachment.key);
			
			// 从数据库中删除
			await c.env.db.prepare('DELETE FROM attachments WHERE att_id = ?').bind(attachment.att_id).run();
		}
	}
};

export default attService;

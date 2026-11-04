import attDao from '../dao/att-dao';
import type { ConfigReadContext } from '../types/context';
import type { ScalarId } from '../types/api';
import type { InlineAttachment, ReceiveAttachment, SendAttachment, NewAttachment, ObjectMetadata } from '../types/attachment';
import { boundId } from '../lib/bound-id';
import orm from '../entity/orm';
import { att } from '../entity/att';
import { sql } from 'drizzle-orm';
import r2Service from './r2-service';
import constant from '../const/constant';
import fileUtils from '../utils/file-utils';
import { attConst } from '../const/entity-const';
import { parseHTML } from 'linkedom';
import { v4 as uuidv4 } from 'uuid';
import domainUtils from '../utils/domain-uitls';
import settingsReader from "./settings-reader";

const attService = {

	async addAtt(c: ConfigReadContext, attachments: ReceiveAttachment[]) {

		for (const attachment of attachments) {

			const metadate: ObjectMetadata = {
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

		await orm(c).insert(att).values(attachments.map(item => ({ ...item, related: item.related === undefined ? undefined : sql`${sql.param(item.related)}`, userId: insertId(item.userId), accountId: insertId(item.accountId), emailId: insertId(item.emailId) }))).run();
	},

	list: attDao.list,

	async toImageUrlHtml(c: ConfigReadContext, content: string) {

		const { r2Domain } = await settingsReader.query(c);

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		let imageDataList: InlineAttachment[] = [];

		for (const img of images) {

			//邮件正文base64图片转cid附件
			const src = img.getAttribute('src');
			if (src && src.startsWith('data:image')) {
				const file = fileUtils.base64ToFile(src);
				const buff = await file.arrayBuffer();
				const cid = uuidv4().replace(/-/g, '');
				const key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(buff) + fileUtils.getExtFileName(file.name);

				img.setAttribute('src', 'cid:' + cid);

				const attData: InlineAttachment = { key, contentId: cid };
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
			if (src && (src.startsWith(String(domainUtils.toOssDomain(r2Domain))) || src.startsWith('attachments/'))) {

				const cid = uuidv4().replace(/-/g, '')
				img.setAttribute('src', 'cid:' + cid);

				const attData: InlineAttachment = { contentId: cid };

				if (src.startsWith(String(domainUtils.toOssDomain(r2Domain)))) {
					attData.key = src.replace(domainUtils.toOssDomain(r2Domain) + '/','');
				}

				if (src.startsWith('attachments/')) {
					attData.key = src;
				}

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
		const keys = [...new Set(imageDataList.filter(item => !item.content).map(item => requiredKey(item.key)))];
		const dbImageList  = await this.selectOneByKeys(c, keys);

		//设置给当前附件
		await Promise.all(imageDataList.map(async image => {
			if (image.content) {
				return;
			}

			const dbImage = dbImageList.find(dbImage => image.key === dbImage.key);
			if (!dbImage) {
				return;
			}

			image.size = dbImage.size;
			image.filename = dbImage.filename;
			image.mimeType = dbImage.mimeType;
			image.contentType = dbImage.mimeType;

			const obj = await r2Service.getObj(c, requiredKey(image.key));
			if (!obj) {
				return;
			}

			image.content = obj instanceof ArrayBuffer ? obj : await obj.arrayBuffer();
		}))

		imageDataList = imageDataList.filter(image => image.content);

		return { imageDataList, html: document.toString() };
	},

	async saveSendAtt(c: ConfigReadContext, attList: SendAttachment[], userId: ScalarId, accountId: ScalarId, emailId: number) {

		const attDataList: (Omit<NewAttachment, 'userId' | 'accountId'> & { userId: ScalarId; accountId: ScalarId })[] = [];

		for (const att of attList) {
			att.buff = fileUtils.base64ToUint8Array(att.content);
			att.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(att.buff) + fileUtils.getExtFileName(att.filename);
			const attData: Omit<NewAttachment, 'userId' | 'accountId'> & { userId: ScalarId; accountId: ScalarId } = { userId, accountId, emailId, key: att.key };
			attData.key = att.key;
			attData.size = att.buff.length;
			attData.filename = att.filename;
			attData.mimeType = att.type;
			attData.type = attConst.type.ATT;
			attDataList.push(attData);
		}

		await orm(c).insert(att).values(attDataList.map(item => ({ ...item, userId: insertId(item.userId), accountId: insertId(item.accountId), emailId: insertId(item.emailId), type: item.type === undefined ? undefined : sql`${sql.param(item.type)}`, key: item.key === undefined ? sql`null` : sql`${sql.param(item.key)}` }))).run();

		for (const att of attList) {
			await r2Service.putObj(c, requiredKey(att.key), att.buff!, {
				contentType: att.type,
				contentDisposition: `attachment;filename=${att.filename}`
			});
		}

	},

	async saveArticleAtt(c: ConfigReadContext, attDataList: InlineAttachment[], userId: ScalarId, accountId: ScalarId, emailId: number) {

		for (const attData of attDataList) {
			attData.userId = userId;
			attData.emailId = emailId;
			attData.accountId = accountId;
			attData.type = attConst.type.EMBED;
			if (!attData.buff) {
				continue;
			}
			await r2Service.putObj(c, requiredKey(attData.key), attData.buff, {
				contentType: attData.mimeType,
				cacheControl: `max-age=259200`,
				contentDisposition: `inline;filename=${attData.filename}`
			});
			delete attData.buff;
		}

		await orm(c).insert(att).values(attDataList.map(item => ({ ...item, related: item.related === undefined ? undefined : sql`${sql.param(item.related)}`, userId: insertId(item.userId), accountId: insertId(item.accountId), emailId: insertId(item.emailId), type: item.type === undefined ? undefined : sql`${sql.param(item.type)}`, key: item.key === undefined ? sql`null` : sql`${sql.param(item.key)}` }))).run();

	},

	async removeByUserIds(c: ConfigReadContext, userIds: ScalarId[]) {
		await this.removeAttByField(c, 'user_id', userIds);
	},

	async removeByEmailIds(c: ConfigReadContext, emailIds: ScalarId[]) {
		await this.removeAttByField(c, 'email_id', emailIds);
	},

	selectByEmailIds: attDao.selectByEmailIds,

	async removeAttByField(c: ConfigReadContext, fieldName: 'user_id' | 'email_id' | 'account_id', fieldValues: ScalarId[]) {

		const sqlList: D1PreparedStatement[] = [];

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

		const attListResult = await c.env.db.batch<{ key: string }>(sqlList);

		const delKeyList = attListResult.flatMap(r => r.results ? r.results.map(row => row.key) : []);

		if (delKeyList.length > 0) {
			try {
				await this.batchDelete(c, delKeyList);
			} catch (e) {
				console.error('删除附件文件失败：', e);
			}
		}

	},

	async batchDelete(c: ConfigReadContext, keys: string[]) {
		if (!keys.length) return;

		const BATCH_SIZE = 1000;

		for (let i = 0; i < keys.length; i += BATCH_SIZE) {
			const batch = keys.slice(i, i + BATCH_SIZE);
			await r2Service.delete(c, batch);
		}

	},

	async removeByAccountId(c: ConfigReadContext, accountId: ScalarId) {
		await this.removeAttByField(c, "account_id", [accountId])
	},

	selectOneByKeys: attDao.selectOneByKeys,


};

export default attService;

function requiredKey(key: string | undefined): string {
	if (key === undefined) throw new TypeError('Attachment key is missing');
	return key;
}

// Required attachment columns have no default: legacy undefined INSERT values compile to SQL null.
function insertId(value: ScalarId | undefined) {
	return value === undefined ? sql`null` : boundId(value);
}

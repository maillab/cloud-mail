import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import settingService from './setting-service';
import domainUtils from '../utils/domain-uitls';
import { settingConst } from '../const/entity-const';
import BizError from '../error/biz-error';

const s3Service = {
	async putObj(c, key, content, metadata = {}) {
		const client = await this.client(c);
		const { bucket } = await settingService.query(c);
		if (!bucket) throw new BizError('S3 Bucket 未配置', 503);
		const object = { Bucket: bucket, Key: key, Body: content };
		if (metadata.cacheControl) object.CacheControl = metadata.cacheControl;
		if (metadata.contentDisposition) object.ContentDisposition = metadata.contentDisposition;
		if (metadata.contentType) object.ContentType = metadata.contentType;
		await client.send(new PutObjectCommand(object));
	},

	async deleteObj(c, keys) {
		const list = [...new Set((typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : [])
			.map(item => String(item || '').trim()).filter(Boolean))];
		if (!list.length) return;
		const client = await this.client(c);
		const { bucket } = await settingService.query(c);
		if (!bucket) throw new BizError('S3 Bucket 未配置', 503);
		// Cloudflare Workers WebCrypto 不保证支持 MD5；逐对象删除可避免 DeleteObjects 的 Content-MD5 依赖。
		for (let index = 0; index < list.length; index += 10) {
			await Promise.all(list.slice(index, index + 10).map(Key => client.send(new DeleteObjectCommand({ Bucket: bucket, Key }))));
		}
	},

	async getObj(c, key) {
		const client = await this.client(c);
		const { bucket } = await settingService.query(c);
		if (!bucket) throw new BizError('S3 Bucket 未配置', 503);
		const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
		const headers = new Headers({ 'Content-Type': result.ContentType || 'application/octet-stream' });
		if (result.ContentDisposition) headers.set('Content-Disposition', result.ContentDisposition);
		if (result.CacheControl) headers.set('Cache-Control', result.CacheControl);
		if (result.ETag) headers.set('ETag', result.ETag);
		return new Response(result.Body, { headers });
	},

	async client(c) {
		const { region, endpoint, s3AccessKey, s3SecretKey, forcePathStyle } = await settingService.query(c);
		if (!endpoint || !s3AccessKey || !s3SecretKey) throw new BizError('S3 配置不完整', 503);
		return new S3Client({
			region: region || 'auto',
			endpoint: domainUtils.toOssDomain(endpoint),
			forcePathStyle: forcePathStyle === settingConst.forcePathStyle.OPEN,
			credentials: { accessKeyId: s3AccessKey, secretAccessKey: s3SecretKey }
		});
	}
};

export default s3Service;

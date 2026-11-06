import s3Service from './s3-service';
import settingService from './setting-service';
import kvObjService from './kv-obj-service';

const r2Service = {

	async storageType(c) {

		const setting = await settingService.query(c);
		const { bucket, endpoint, s3AccessKey, s3SecretKey } = setting;

		if (!!(bucket && endpoint && s3AccessKey && s3SecretKey)) {
			return 'S3';
		}

		if (c.env.r2) {
			return 'R2';
		}

		return 'KV';
	},

	async putObj(c, key, content, metadata) {

		const storageType = await this.storageType(c);

		if (storageType === 'KV') {
			await kvObjService.putObj(c, key, content, metadata);
		}

		if (storageType === 'R2') {
			await c.env.r2.put(key, content, {
				httpMetadata: { ...metadata }
			});
		}

		if (storageType === 'S3') {
			await s3Service.putObj(c, key, content, metadata);
		}

	},

	async getObj(c, key) {
		const storageType = await this.storageType(c);

		if (storageType === 'KV') {
			return await kvObjService.getObj(c, key);
		}

		if (storageType === 'R2') {
			return await c.env.r2.get(key);
		}

		if (storageType === 'S3') {
			return await s3Service.getObj(c, key);
		}
	},

	/**
	 * Always returns a Response (or null if missing) so HTTP handlers
	 * can serve KV / R2 / S3 the same way.
	 */
	async toObjResp(c, key) {
		try {
			const storageType = await this.storageType(c);

			if (storageType === 'KV') {
				return await kvObjService.getObj(c, key);
			}

			if (storageType === 'R2') {
				const obj = await c.env.r2.get(key);
				if (!obj) {
					return null;
				}
				return new Response(obj.body, {
					headers: {
						'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
						'Content-Disposition': obj.httpMetadata?.contentDisposition || null,
						'Cache-Control': obj.httpMetadata?.cacheControl || null
					}
				});
			}

			if (storageType === 'S3') {
				return await s3Service.getObj(c, key);
			}

			return null;
		} catch (e) {
			const status = e?.$metadata?.httpStatusCode;
			const code = e?.name || e?.Code || e?.code;
			if (status === 404 || code === 'NoSuchKey' || code === 'NotFound') {
				return null;
			}
			throw e;
		}
	},

	async delete(c, key) {

		const storageType = await this.storageType(c);

		if (storageType === 'KV') {
			await kvObjService.deleteObj(c, key);
		}

		if (storageType === 'R2') {
			await c.env.r2.delete(key);
		}

		if (storageType === 'S3'){
			await s3Service.deleteObj(c, key);
		}

	}

};
export default r2Service;

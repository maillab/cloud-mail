import s3Service from './s3-service';
import settingsReader from './settings-reader';
import kvObjService from './kv-obj-service';
import type { ConfigReadContext } from '../types/context';
import type { ObjectContent, ObjectMetadata, StorageType, StoredObject } from '../types/attachment';

const r2Service = {

	async storageType(c: ConfigReadContext): Promise<StorageType> {

		const setting = await settingsReader.query(c);
		const { bucket, endpoint, s3AccessKey, s3SecretKey } = setting;

		if (!!(bucket && endpoint && s3AccessKey && s3SecretKey)) {
			return 'S3';
		}

		if (c.env.r2) {
			return 'R2';
		}

		return 'KV';
	},

	async putObj(c: ConfigReadContext, key: string, content: ObjectContent, metadata: ObjectMetadata): Promise<void> {

		const storageType = await this.storageType(c);

		if (storageType === 'KV') {
			await kvObjService.putObj(c, key, content, metadata);
		}

		if (storageType === 'R2') {
			if (!c.env.r2) throw new TypeError("Cannot read properties of undefined (reading 'put')");
			await c.env.r2.put(key, content, {
				// Historical attachment rows may contain a null MIME type. Preserve
				// that value and let the binding apply its existing validation.
				httpMetadata: { ...metadata } as R2HTTPMetadata
			});
		}

		if (storageType === 'S3') {
			await s3Service.putObj(c, key, content, metadata);
		}

	},

	async getObj(c: ConfigReadContext, key: string): Promise<StoredObject> {
		const storageType = await this.storageType(c);

		if (storageType === 'KV') {
			return await kvObjService.getObj(c, key);
		}

		if (storageType === 'R2') {
			if (!c.env.r2) throw new TypeError("Cannot read properties of undefined (reading 'get')");
			return await c.env.r2.get(key);
		}

		if (storageType === 'S3') {
			return await s3Service.getObj(c, key);
		}
		throw new TypeError("Cannot read properties of undefined (reading 'get')");
	},

	async delete(c: ConfigReadContext, key: string | string[]): Promise<void> {

		const storageType = await this.storageType(c);

		if (storageType === 'KV') {
			await kvObjService.deleteObj(c, key);
		}

		if (storageType === 'R2') {
			if (!c.env.r2) throw new TypeError("Cannot read properties of undefined (reading 'delete')");
			await c.env.r2.delete(key);
		}

		if (storageType === 'S3'){
			await s3Service.deleteObj(c, key);
		}

	}

};
export default r2Service;

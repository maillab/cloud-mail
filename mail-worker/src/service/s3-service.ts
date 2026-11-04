import type { S3Client } from '@aws-sdk/client-s3';
import settingsReader from './settings-reader';
import { createS3Client, deleteS3Objects, getS3Object, putS3Object } from '../integrations/s3-gateway';
import type { ConfigReadContext } from '../types/context';
import type { ObjectContent, ObjectMetadata } from '../types/attachment';

const s3Service = {
	async putObj(c: ConfigReadContext, key: string, content: ObjectContent, metadata: ObjectMetadata): Promise<void> {
		const client = await this.client(c);
		const { bucket } = await settingsReader.query(c);
		await putS3Object(client, bucket, key, content, metadata);
	},

	async deleteObj(c: ConfigReadContext, keys: string | string[]): Promise<void> {
		if (typeof keys === 'string') keys = [keys];
		if (keys.length === 0) return;
		const client = await this.client(c);
		const { bucket } = await settingsReader.query(c);
		await deleteS3Objects(client, bucket, keys);
	},

	async getObj(c: ConfigReadContext, key: string): Promise<Response> {
		const client = await this.client(c);
		const { bucket } = await settingsReader.query(c);
		return getS3Object(client, bucket, key);
	},

	async client(c: ConfigReadContext): Promise<S3Client> {
		return createS3Client(await settingsReader.query(c));
	}
};
export default s3Service;

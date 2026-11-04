import { S3Client, PutObjectCommand, DeleteObjectsCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { PutObjectCommandInput } from '@aws-sdk/client-s3';
import domainUtils from '../utils/domain-uitls';
import { settingConst } from '../const/entity-const';
import type { ObjectContent, ObjectMetadata } from '../types/attachment';
import type { SettingsCache } from '../types/settings';

type S3Configuration = Pick<SettingsCache, 'region' | 'endpoint' | 's3AccessKey' | 's3SecretKey' | 'forcePathStyle'>;

function sdkBody(content: ObjectContent) {
	if (content instanceof ArrayBuffer) return new Uint8Array(content);
	if (ArrayBuffer.isView(content)) return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
	return content;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function createS3Client(config: S3Configuration): S3Client {
	if (typeof config.s3AccessKey !== 'string' || typeof config.s3SecretKey !== 'string') throw new Error('Resolved credential object is not valid');
	return new S3Client({ region: config.region || 'auto', endpoint: domainUtils.toOssDomain(config.endpoint) || undefined,
		forcePathStyle: config.forcePathStyle === settingConst.forcePathStyle.OPEN,
		credentials: { accessKeyId: config.s3AccessKey, secretAccessKey: config.s3SecretKey } });
}

export async function putS3Object(client: S3Client, bucket: string | undefined, key: string, content: ObjectContent, metadata: ObjectMetadata): Promise<void> {
	const object: PutObjectCommandInput = { Bucket: bucket, Key: key, Body: sdkBody(content), CacheControl: metadata.cacheControl };
	if (metadata.cacheControl) object.CacheControl = metadata.cacheControl;
	if (metadata.contentDisposition) object.ContentDisposition = metadata.contentDisposition;
	if (metadata.contentType) object.ContentType = metadata.contentType;
	await client.send(new PutObjectCommand(object));
}

export async function deleteS3Objects(client: S3Client, bucket: string | undefined, keys: string[]): Promise<void> {
	client.middlewareStack.add(next => async args => {
		const request = args.request;
		if (!isRecord(request) || !isRecord(request.headers)) throw new TypeError('S3 request headers unavailable');
		const body = request.body;
		const data = new TextEncoder().encode(body === undefined ? undefined : String(body));
		const hash = new Uint8Array(await crypto.subtle.digest('MD5', data));
		request.headers['Content-MD5'] = btoa(String.fromCharCode(...hash));
		return next(args);
	}, { step: 'build', name: 'inspectRequestMiddleware' });
	await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map(key => ({ Key: key })) } }));
}

export async function getS3Object(client: S3Client, bucket: string | undefined, key: string): Promise<Response> {
	const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
	return new Response(result.Body?.transformToWebStream(), { headers: {
		'Content-Type': result.ContentType || 'application/octet-stream',
		'Content-Disposition': String(result.ContentDisposition || null), 'Cache-Control': String(result.CacheControl || null)
	} });
}

import BizError from '../error/biz-error';
import constant from '../const/constant';

const ALLOWED_PREFIXES = [constant.ATTACHMENT_PREFIX, constant.BACKGROUND_PREFIX];
const DANGEROUS_TYPES = [
	'text/html', 'application/xhtml+xml', 'image/svg+xml', 'application/xml', 'text/xml',
	'application/javascript', 'text/javascript'
];

export function normalizeObjectKey(value) {
	let key;
	try { key = decodeURIComponent(String(value || '')); }
	catch { throw new BizError('对象路径无效', 400); }
	key = key.replace(/^\/+/, '');
	if (!key || key.length > 1024 || key.includes('\\') || key.includes('\0') || key.split('/').includes('..')) {
		throw new BizError('对象路径无效', 400);
	}
	if (!ALLOWED_PREFIXES.some(prefix => key.startsWith(prefix))) throw new BizError('对象路径无效', 404);
	return key;
}

function metadataFromObject(object) {
	if (object instanceof Response) {
		return {
			body: object.body,
			status: object.status,
			contentType: object.headers.get('Content-Type'),
			contentDisposition: object.headers.get('Content-Disposition'),
			cacheControl: object.headers.get('Cache-Control'),
			etag: object.headers.get('ETag')
		};
	}
	return {
		body: object?.body,
		status: 200,
		contentType: object?.httpMetadata?.contentType,
		contentDisposition: object?.httpMetadata?.contentDisposition,
		cacheControl: object?.httpMetadata?.cacheControl,
		etag: object?.httpEtag || object?.etag
	};
}

export function objectToResponse(object, key) {
	if (!object) return new Response('Not found', { status: 404 });
	const metadata = metadataFromObject(object);
	if (!metadata.body) return new Response('Not found', { status: 404 });
	const contentType = String(metadata.contentType || 'application/octet-stream').slice(0, 255);
	const headers = new Headers({
		'Content-Type': contentType,
		'X-Content-Type-Options': 'nosniff',
		'Content-Security-Policy': "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'",
		'Cache-Control': metadata.cacheControl || (key.startsWith(constant.ATTACHMENT_PREFIX) ? 'public, max-age=259200' : 'public, max-age=86400')
	});
	const dangerous = DANGEROUS_TYPES.some(type => contentType.toLowerCase().startsWith(type));
	if (dangerous) {
		const filename = key.split('/').pop() || 'download';
		headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
	} else if (metadata.contentDisposition) {
		headers.set('Content-Disposition', String(metadata.contentDisposition).replace(/[\r\n]/g, '').slice(0, 1024));
	}
	if (metadata.etag) headers.set('ETag', String(metadata.etag).replace(/[\r\n]/g, '').slice(0, 256));
	return new Response(metadata.body, { status: metadata.status || 200, headers });
}

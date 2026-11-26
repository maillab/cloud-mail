import BizError from '../error/biz-error';
import r2Service from './r2-service';

// Signature assets. The original upload can be any size; what actually goes into
// an email is always a downscaled derivative, because a 2000px banner embedded
// in every reply is a real cost and a rendering problem in most clients.
export const MASTER_MAX_EDGE = 2000;
export const DELIVERY_MAX_EDGE = 1200;
export const DISPLAY_WIDTH = 600;
export const DISPLAY_HEIGHT = 200;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const TARGET_IMAGE_BYTES = 280 * 1024;

const IMAGE_TYPES = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp'
};

function normalizeText(value) {
	if (value == null) {
		return '';
	}
	if (typeof value !== 'string' || value.length > 2000) {
		throw new BizError('Signature text must be 2,000 characters or fewer.');
	}
	return value.trim();
}

function normalizeHtml(value) {
	if (value == null) {
		return '';
	}
	if (typeof value !== 'string' || value.length > 10000) {
		throw new BizError('HTML signature must be 10,000 characters or fewer.');
	}
	return value.trim();
}

function decodeDataUrl(dataUrl) {
	const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
	if (!match || !IMAGE_TYPES[match[1]]) {
		throw new BizError('Signature image must be a PNG, JPG, or WEBP file.');
	}
	let binary;
	try {
		binary = atob(match[2]);
	} catch {
		throw new BizError('Signature image data is invalid.');
	}
	if (binary.length > MAX_IMAGE_BYTES) {
		throw new BizError('Signature image must be 2 MB or smaller.');
	}
	return { contentType: match[1], extension: IMAGE_TYPES[match[1]], bytes: Uint8Array.from(binary, ch => ch.charCodeAt(0)) };
}

async function saveImage(c, userId, dataUrl) {
	if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 64) {
		throw new BizError('Signature image must be 2 MB or smaller.');
	}

	const { contentType, extension, bytes } = decodeDataUrl(dataUrl);
	const key = `signatures/${userId}/${crypto.randomUUID()}.${extension}`;
	await r2Service.putObj(c, key, bytes, {
		contentType,
		cacheControl: 'public, max-age=31536000, immutable'
	});
	return key;
}

// Stores the source upload, then produces the delivery derivative the mail body
// actually references. Both live in R2 so the browser never carries the master.
export async function saveImageSet(c, userId, dataUrl) {
	if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 64) {
		throw new BizError('Signature image must be 2 MB or smaller.');
	}

	const { contentType, extension, bytes } = decodeDataUrl(dataUrl);
	const masterKey = `signatures/${userId}/${crypto.randomUUID()}.${extension}`;
	await r2Service.putObj(c, masterKey, bytes, {
		contentType,
		cacheControl: 'public, max-age=31536000, immutable'
	});

	const delivery = await resizeForEmail(bytes, contentType);
	if (!delivery) {
		return { masterKey, deliveryKey: masterKey, width: 0, height: 0, bytes: bytes.length, resized: false };
	}

	const deliveryKey = `signatures/${userId}/${crypto.randomUUID()}.${delivery.extension}`;
	await r2Service.putObj(c, deliveryKey, delivery.bytes, {
		contentType: delivery.contentType,
		cacheControl: 'public, max-age=31536000, immutable'
	});
	return {
		masterKey,
		deliveryKey,
		width: delivery.width,
		height: delivery.height,
		bytes: delivery.bytes.length,
		resized: true
	};
}

// Rescale in the worker with the platform image decoder, so an uploaded 2000px
// banner is never sent as-is. Falls back to the master when the runtime cannot
// decode the format: a working signature beats a broken one.
async function resizeForEmail(bytes, contentType) {
	if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
		return null;
	}
	let bitmap;
	try {
		bitmap = await createImageBitmap(new Blob([bytes], { type: contentType }));
	} catch {
		return null;
	}

	const scale = Math.min(1, DELIVERY_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
	const width = Math.max(1, Math.round(bitmap.width * scale));
	const height = Math.max(1, Math.round(bitmap.height * scale));
	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext('2d');
	if (!context) {
		bitmap.close?.();
		return null;
	}
	context.imageSmoothingEnabled = true;
	context.imageSmoothingQuality = 'high';
	context.drawImage(bitmap, 0, 0, width, height);
	bitmap.close?.();

	// WEBP is the smallest of the formats the mail engine already accepts; PNG is
	// kept for artwork that needs lossless edges.
	const types = contentType === 'image/png' ? ['image/webp', 'image/png'] : ['image/webp', 'image/jpeg'];
	for (const type of types) {
		const blob = await canvas.convertToBlob({ type, quality: 0.9 });
		const buffer = new Uint8Array(await blob.arrayBuffer());
		if (buffer.length <= TARGET_IMAGE_BYTES || type === types[types.length - 1]) {
			return {
				bytes: buffer,
				contentType: type,
				extension: IMAGE_TYPES[type],
				width,
				height
			};
		}
	}
	return null;
}

async function deleteImage(c, key) {
	if (typeof key === 'string' && key.startsWith('signatures/')) {
		await r2Service.delete(c, key);
	}
}

function imageUrl(requestUrl, key) {
	if (!key) return null;
	if (typeof key === 'string' && (key.startsWith('http://') || key.startsWith('https://'))) {
		return key;
	}
	return new URL(`/oss/${String(key).replace(/^\//, '')}`, requestUrl).href;
}

function escapeHtml(value) {
	return String(value || '').replace(/[&<>"']/g, character => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;'
	})[character]);
}

function html(profile, requestUrl) {
	if (!profile) return '';

	// If explicit HTML signature is provided
	if (profile.signature && profile.signature.trim()) {
		const rawHtml = profile.signature.trim();
		if (rawHtml.includes('xpass-user-signature')) {
			return rawHtml;
		}
		return `<div class="xpass-user-signature" style="margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e5e5; font-family: sans-serif;">${rawHtml}</div>`;
	}

	const text = profile.signatureText || profile.signature_text || '';
	const textHtml = text
		? `<div style="font-size: 14px; color: #333333; margin-bottom: 6px; line-height: 1.5;">${escapeHtml(text).replace(/\r\n?|\n/g, '<br>')}</div>`
		: '';

	// The delivery derivative is what goes in the mail: a fixed 600x200 box with a
	// responsive fallback, never the multi-thousand-pixel master.
	const imageKey = profile.signatureDeliveryKey || profile.signature_delivery_key
		|| profile.signatureImageKey || profile.signature_image_key;
	const src = imageUrl(requestUrl, imageKey) || profile.signatureImageUrl || profile.signature_image_url;
	const image = src
		? `<img src="${escapeHtml(src)}" width="${DISPLAY_WIDTH}" height="${DISPLAY_HEIGHT}" alt="Signature" style="width:${DISPLAY_WIDTH}px;max-width:100%;height:auto;display:block;border:0;" />`
		: '';

	if (!textHtml && !image) {
		return '';
	}
	return `<div class="xpass-user-signature" style="margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e5e5; font-family: sans-serif;">${textHtml}${image}</div>`;
}

function plainText(profile) {
	if (!profile) return '';
	return (profile.signatureText || profile.signature_text || '').trim();
}

export default {
	MASTER_MAX_EDGE,
	DELIVERY_MAX_EDGE,
	DISPLAY_WIDTH,
	DISPLAY_HEIGHT,
	normalizeText,
	normalizeHtml,
	saveImage,
	saveImageSet,
	deleteImage,
	imageUrl,
	html,
	plainText
};

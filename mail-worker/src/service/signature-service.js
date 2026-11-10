import BizError from '../error/biz-error';
import r2Service from './r2-service';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
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

async function saveImage(c, userId, dataUrl) {
	if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 64) {
		throw new BizError('Signature image must be 2 MB or smaller.');
	}

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

	const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
	const key = `signatures/${userId}/${crypto.randomUUID()}.${IMAGE_TYPES[match[1]]}`;
	await r2Service.putObj(c, key, bytes, {
		contentType: match[1],
		cacheControl: 'public, max-age=31536000, immutable'
	});
	return key;
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

	const imageKey = profile.signatureImageKey || profile.signature_image_key;
	const src = imageUrl(requestUrl, imageKey) || profile.signatureImageUrl || profile.signature_image_url;
	const image = src
		? `<img src="${escapeHtml(src)}" width="250" alt="Signature" style="max-width: 250px; height: auto; display: block; border: 0;" />`
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

export default { normalizeText, normalizeHtml, saveImage, deleteImage, imageUrl, html, plainText };

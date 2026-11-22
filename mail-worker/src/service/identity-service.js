import BizError from '../error/biz-error';
import r2Service from './r2-service';

const MAX_USERNAME_LENGTH = 24;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const AVATAR_TYPES = {
	png: { mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
	jpg: { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
	webp: { mime: 'image/webp', magic: null }
};

const RESERVED_USERNAMES = new Set([
	'admin', 'administrator', 'root', 'system', 'support', 'help', 'info',
	'contact', 'sales', 'billing', 'finance', 'hr', 'jobs', 'legal', 'team',
	'security', 'privacy', 'abuse', 'postmaster', 'hostmaster', 'mailer',
	'no-reply', 'noreply', 'notifications', 'alerts', 'api', 'www', 'mail',
	'hq', 'xpass', 'me', 'user', 'users', 'null', 'undefined', 'anonymous'
]);

export function normalizeUsername(value) {
	let handle = String(value ?? '').trim().toLowerCase();
	handle = handle.replace(/^@+/, '');
	handle = handle.replace(/[^a-z0-9-]+/g, '-');
	handle = handle.replace(/-{2,}/g, '-');
	handle = handle.replace(/^-+|-+$/g, '');
	return handle.slice(0, MAX_USERNAME_LENGTH);
}

export function validateUsername(value, { allowEmpty = false } = {}) {
	const raw = String(value ?? '').trim().replace(/^@+/, '');
	const handle = normalizeUsername(raw);
	if (!handle) {
		if (allowEmpty) return '';
		throw new BizError('Username is required.');
	}
	// Length and character problems are reported, not silently rewritten: the
	// identity form shows this message next to the field so the person can fix
	// their own handle instead of wondering where the change went.
	if (raw.length > MAX_USERNAME_LENGTH) {
		throw new BizError(`Username must be ${MAX_USERNAME_LENGTH} characters or fewer.`);
	}
	if (raw.toLowerCase() !== handle) {
		throw new BizError('Usernames use lowercase letters, numbers and single hyphens only.');
	}
	if (handle.length < 3) {
		throw new BizError('Username must be at least 3 characters.');
	}
	if (!/^[a-z]/.test(handle)) {
		throw new BizError('Username must start with a letter.');
	}
	if (RESERVED_USERNAMES.has(handle)) {
		throw new BizError('That username is reserved.');
	}
	return handle;
}

export async function assertUsernameAvailable(c, username, exceptUserId = null) {
	const row = await c.env.db.prepare(
		`SELECT user_id FROM user
		 WHERE lower(username) = lower(?) AND COALESCE(is_del, 0) = 0
		   AND (? IS NULL OR user_id <> ?)
		 LIMIT 1`
	).bind(username, exceptUserId, exceptUserId).first();
	if (row) {
		throw new BizError('That username is already taken.');
	}
}

export function normalizeDisplayName(value, fallback = '') {
	const name = String(value ?? '').trim().replace(/\s+/g, ' ');
	if (name) return name.slice(0, 80);
	return String(fallback || '').slice(0, 80);
}

export function normalizeJobTitle(value) {
	return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

export function normalizePhone(value) {
	const phone = String(value ?? '').trim();
	if (!phone) return '';
	if (!/^[0-9+][0-9\s()-]{5,19}$/.test(phone)) {
		throw new BizError('Enter a valid phone number.');
	}
	return phone;
}

function detectImageType(bytes) {
	if (bytes.length < 12) return null;
	const png = AVATAR_TYPES.png.magic.every((byte, i) => bytes[i] === byte);
	if (png) return 'png';
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
	const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
	const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
	if (riff === 'RIFF' && webp === 'WEBP') return 'webp';
	return null;
}

export async function saveAvatar(c, userId, dataUrl) {
	if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(MAX_AVATAR_BYTES * 4 / 3) + 64) {
		throw new BizError('Profile photo must be 2 MB or smaller.');
	}

	const match = /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
	if (!match) {
		throw new BizError('Profile photo data is invalid.');
	}

	let binary;
	try {
		binary = atob(match[2]);
	} catch {
		throw new BizError('Profile photo data is invalid.');
	}

	if (binary.length > MAX_AVATAR_BYTES) {
		throw new BizError('Profile photo must be 2 MB or smaller.');
	}

	const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
	const type = detectImageType(bytes);
	if (!type) {
		throw new BizError('Profile photo must be a PNG, JPG, or WEBP image.');
	}

	const key = `avatars/${userId}/${crypto.randomUUID()}.${type}`;
	await r2Service.putObj(c, key, bytes, {
		contentType: AVATAR_TYPES[type].mime,
		cacheControl: 'private, max-age=86400'
	});
	return key;
}

export async function deleteAvatar(c, key) {
	if (typeof key === 'string' && key.startsWith('avatars/')) {
		await r2Service.delete(c, key);
	}
}

export function avatarUrl(requestUrl, key) {
	if (!key) return null;
	if (typeof key === 'string' && (key.startsWith('http://') || key.startsWith('https://'))) {
		return key;
	}
	return new URL(`/oss/${String(key).replace(/^\//, '')}`, requestUrl).href;
}

export function initialsFor(name) {
	const parts = String(name || '')
		.replace(/[^\p{L}\p{N}\s]/gu, ' ')
		.split(/\s+/)
		.filter(Boolean);
	if (!parts.length) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function toIdentity(c, row, { team = null } = {}) {
	if (!row) return null;
	return {
		userId: row.user_id ?? row.userId,
		displayName: row.display_name || row.displayName || '',
		username: row.username || '',
		email: row.email || '',
		phone: row.phone || '',
		jobTitle: row.job_title || row.jobTitle || '',
		avatarUrl: avatarUrl(c.req.url, row.avatar_key || row.avatarKey),
		team: team ? { id: team.team_id, name: team.name, slug: team.slug } : null
	};
}

export async function findTeamsByIds(c, ids) {
	const clean = [...new Set((ids || []).map(Number).filter(Boolean))];
	if (!clean.length) return new Map();
	const placeholders = clean.map(() => '?').join(',');
	const { results } = await c.env.db.prepare(
		`SELECT team_id, name, slug FROM team WHERE team_id IN (${placeholders})`
	).bind(...clean).all();
	return new Map((results || []).map(row => [row.team_id, row]));
}

export default {
	normalizeUsername,
	validateUsername,
	assertUsernameAvailable,
	normalizeDisplayName,
	normalizeJobTitle,
	normalizePhone,
	saveAvatar,
	deleteAvatar,
	avatarUrl,
	initialsFor,
	toIdentity,
	findTeamsByIds,
	MAX_USERNAME_LENGTH,
	RESERVED_USERNAMES
};
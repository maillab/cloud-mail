import BizError from '../error/biz-error';
import verifyUtils from './verify-utils';

const DEFAULT_MAX_STRING = 4096;

export function toTrimmedString(value, { name = '参数', required = false, max = DEFAULT_MAX_STRING } = {}) {
	if (value === undefined || value === null) {
		if (required) throw new BizError(`${name}不能为空`, 400);
		return '';
	}

	if (typeof value !== 'string') {
		throw new BizError(`${name}格式错误`, 400);
	}

	const result = value.trim();
	if (required && !result) throw new BizError(`${name}不能为空`, 400);
	if (result.length > max) throw new BizError(`${name}长度不能超过${max}`, 400);
	return result;
}

export function toInteger(value, {
	name = '参数',
	defaultValue,
	min = Number.MIN_SAFE_INTEGER,
	max = Number.MAX_SAFE_INTEGER,
	required = false
} = {}) {
	if (value === undefined || value === null || value === '') {
		if (required && defaultValue === undefined) throw new BizError(`${name}不能为空`, 400);
		return defaultValue;
	}

	const number = Number(value);
	if (!Number.isSafeInteger(number) || number < min || number > max) {
		throw new BizError(`${name}必须是${min}到${max}之间的整数`, 400);
	}
	return number;
}

export function toPageSize(value, { defaultValue = 20, max = 50 } = {}) {
	return toInteger(value, { name: 'size', defaultValue, min: 1, max });
}

export function toPageNumber(value, { defaultValue = 1, max = 1_000_000 } = {}) {
	return toInteger(value, { name: 'num', defaultValue, min: 1, max });
}

export function toId(value, name = 'id') {
	return toInteger(value, { name, required: true, min: 1, max: Number.MAX_SAFE_INTEGER });
}

export function toIdList(value, { name = 'ids', maxItems = 500 } = {}) {
	let list;
	if (Array.isArray(value)) {
		list = value;
	} else if (typeof value === 'string') {
		list = value.split(',');
	} else {
		throw new BizError(`${name}格式错误`, 400);
	}

	const result = [...new Set(list.map(item => toId(item, name)))];
	if (result.length === 0) throw new BizError(`${name}不能为空`, 400);
	if (result.length > maxItems) throw new BizError(`${name}数量不能超过${maxItems}`, 400);
	return result;
}

export function normalizeEmail(value, { name = '邮箱', required = true } = {}) {
	const email = toTrimmedString(value, { name, required, max: 254 }).toLowerCase();
	if (email && !verifyUtils.isEmail(email)) {
		throw new BizError(`${name}格式错误`, 400);
	}
	return email;
}

export function normalizeEmailList(value, {
	name = '邮箱列表',
	required = false,
	maxItems = 100,
	deduplicate = true
} = {}) {
	if (value === undefined || value === null || value === '') {
		if (required) throw new BizError(`${name}不能为空`, 400);
		return [];
	}

	let list;
	if (Array.isArray(value)) {
		list = value;
	} else if (typeof value === 'string') {
		list = value.split(',');
	} else {
		throw new BizError(`${name}格式错误`, 400);
	}

	let result = list.map(item => normalizeEmail(item, { name }));
	if (deduplicate) result = [...new Set(result)];
	if (required && result.length === 0) throw new BizError(`${name}不能为空`, 400);
	if (result.length > maxItems) throw new BizError(`${name}数量不能超过${maxItems}`, 400);
	return result;
}

export function normalizeDomainList(value, { name = '域名列表', maxItems = 100 } = {}) {
	if (!Array.isArray(value)) throw new BizError(`${name}格式错误`, 400);
	const result = [...new Set(value.map(item => toTrimmedString(item, { name, required: true, max: 253 }).toLowerCase()))];
	if (result.length > maxItems) throw new BizError(`${name}数量不能超过${maxItems}`, 400);
	for (const domain of result) {
		if (!verifyUtils.isDomain(domain)) throw new BizError(`${name}中包含无效域名`, 400);
	}
	return result;
}

export function toStringList(value, { name = '列表', maxItems = 100, maxItemLength = 256 } = {}) {
	if (value === undefined || value === null || value === '') return [];
	const list = Array.isArray(value) ? value : String(value).split(',');
	const result = [...new Set(list.map(item => toTrimmedString(item, { name, max: maxItemLength })).filter(Boolean))];
	if (result.length > maxItems) throw new BizError(`${name}数量不能超过${maxItems}`, 400);
	return result;
}

export function assertEnum(value, allowed, { name = '参数' } = {}) {
	if (!allowed.includes(value)) throw new BizError(`${name}取值无效`, 400);
	return value;
}

export function isMaskedSecret(value) {
	return typeof value === 'string' && /\*{4,}$/.test(value);
}

export function parseBooleanEnv(value, defaultValue = false) {
	if (value === undefined || value === null || value === '') return defaultValue;
	if (value === true || value === 'true' || value === 1 || value === '1') return true;
	if (value === false || value === 'false' || value === 0 || value === '0') return false;
	return defaultValue;
}

export function safeJsonParse(value, fallback = null) {
	try {
		return JSON.parse(value);
	} catch {
		return fallback;
	}
}

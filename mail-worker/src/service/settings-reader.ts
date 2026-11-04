import KvConst from '../const/kv-const';
import BizError from '../error/biz-error';
import { tFor } from '../i18n/i18n';
import type { ConfigReadContext } from '../types/context';
import type { SettingsCache } from '../types/settings';

/** Our persisted cache format; individual legacy fields are consumed at their original boundaries. */
function settingsCache(value: unknown): SettingsCache {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError(`Cannot create property 'domainList' on ${typeof value} '${String(value)}'`);
	}
	const record = value as Record<string, unknown>;
	// This KV value is written from our Drizzle row, rather than a provider DTO.
	// Do not add blanket rejection of historical fields during a type migration;
	// preserve raw values and request-cache identity, including older omitted fields.
	return record as SettingsCache;
}

function prefixFilter(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value === null || value === undefined) throw new TypeError(`Cannot read properties of ${String(value)} (reading 'split')`);
	throw new TypeError('setting.emailPrefixFilter.split is not a function');
}

const settingsReader = {
	async query(c: ConfigReadContext): Promise<SettingsCache> {
		const t = tFor(c);
		if (c.get?.('setting')) return c.get('setting')!;
		const cached: unknown = await c.env.kv.get(KvConst.SETTING, { type: 'json' });
		if (!cached) throw new BizError('数据库未初始化 Database not initialized.');

		let domainList: unknown = c.env.domain;
		if (typeof domainList === 'string') {
			try { domainList = JSON.parse(domainList); }
			catch (_error) { throw new BizError(t('notJsonDomain')); }
		}
		if (!c.env.domain) throw new BizError(t('noDomainVariable'));
		if (!Array.isArray(domainList)) {
			if (domainList === null || domainList === undefined) throw new TypeError(`Cannot read properties of ${String(domainList)} (reading 'map')`);
			throw new TypeError('domainList.map is not a function');
		}
		const setting = settingsCache(cached);
		setting.domainList = (domainList as unknown[]).map(item => '@' + item);

		let projectLink = c.env.project_link;
		if (typeof projectLink === 'string' && projectLink === 'false') projectLink = false;
		else if (projectLink === false) projectLink = false;
		else projectLink = true;
		setting.projectLink = projectLink;
		setting.emailPrefixFilter = prefixFilter(setting.emailPrefixFilter).split(',').filter(Boolean);
		c.set?.('setting', setting);
		return setting;
	},
};

export default settingsReader;

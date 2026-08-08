import analysisDao from '../dao/analysis-dao';
import orm from '../entity/orm';
import email from '../entity/email';
import { desc, count, eq, and, ne, isNotNull } from 'drizzle-orm';
import { emailConst } from '../const/entity-const';
import kvConst from '../const/kv-const';
import dayjs from 'dayjs';
import { toUtc } from '../utils/date-uitil';
import BizError from '../error/biz-error';

function normalizeTimeZone(value) {
	const timeZone = String(value || 'UTC').trim();
	if (!timeZone || timeZone.length > 64) throw new BizError('时区格式错误', 400);
	try { new Intl.DateTimeFormat('en-US', { timeZone }).format(); } catch { throw new BizError('时区格式错误', 400); }
	return timeZone;
}

const analysisService = {
	async echarts(c, params = {}) {
		const normalized = { timeZone: normalizeTimeZone(params.timeZone) };
		if (!this.analysisCacheEnabled(c)) return this.queryEcharts(c, normalized);
		const cacheKey = this.echartsCacheKey(normalized);
		const cache = await c.env.kv.get(cacheKey, { type: 'json' });
		if (cache) return cache;
		return this.refreshEchartsCacheByKey(c, cacheKey);
	},

	async refreshEchartsCacheByKey(c, cacheKey) {
		const params = this.echartsParamsByCacheKey(cacheKey);
		const data = await this.queryEcharts(c, params);
		await c.env.kv.put(cacheKey, JSON.stringify(data), { expirationTtl: 6 * 60 * 60 });
		return data;
	},

	async refreshEchartsCache(c) {
		if (!this.analysisCacheEnabled(c)) return;
		const { keys } = await c.env.kv.list({ prefix: kvConst.ANALYSIS_ECHARTS, limit: 100 });
		const results = await Promise.allSettled(keys.map(key => this.refreshEchartsCacheByKey(c, key.name)));
		for (const result of results) if (result.status === 'rejected') console.warn('刷新分析缓存失败', result.reason?.message || result.reason);
	},

	async queryEcharts(c, params = {}) {
		const timeZone = normalizeTimeZone(params.timeZone);
		const utcNow = toUtc();
		const localNow = utcNow.tz(timeZone);
		const offsetMinutes = localNow.utcOffset();

		const [numberCount, nameRatio, userDayCountRaw, receiveDayCountRaw, sendDayCountRaw, daySendTotalRaw] = await Promise.all([
			analysisDao.numberCount(c),
			orm(c).select({ name: email.name, total: count() }).from(email)
				.where(and(eq(email.type, emailConst.type.RECEIVE), isNotNull(email.name), ne(email.name, 'noreply'), ne(email.name, '')))
				.groupBy(email.name).orderBy(desc(count())).limit(6),
			analysisDao.userDayCount(c, offsetMinutes),
			analysisDao.receiveDayCount(c, offsetMinutes),
			analysisDao.sendDayCount(c, offsetMinutes),
			c.env.kv.get(kvConst.SEND_DAY_COUNT + dayjs().format('YYYY-MM-DD'))
		]);

		return {
			numberCount,
			userDayCount: this.filterEmptyDay(userDayCountRaw, timeZone),
			receiveRatio: { nameRatio },
			emailDayCount: {
				receiveDayCount: this.filterEmptyDay(receiveDayCountRaw, timeZone),
				sendDayCount: this.filterEmptyDay(sendDayCountRaw, timeZone)
			},
			daySendTotal: Number(daySendTotalRaw || 0)
		};
	},

	filterEmptyDay(data = [], timeZone) {
		const today = toUtc().tz(normalizeTimeZone(timeZone)).subtract(1, 'day');
		return Array.from({ length: 15 }, (_, index) => today.subtract(14 - index, 'day').format('YYYY-MM-DD'))
			.map(date => ({ date, total: Number(data.find(item => item.date === date)?.total || 0) }));
	},

	echartsCacheKey(params = {}) {
		return kvConst.ANALYSIS_ECHARTS + encodeURIComponent(normalizeTimeZone(params.timeZone));
	},

	echartsParamsByCacheKey(cacheKey) {
		if (!String(cacheKey).startsWith(kvConst.ANALYSIS_ECHARTS)) throw new BizError('缓存键无效', 400);
		return { timeZone: normalizeTimeZone(decodeURIComponent(String(cacheKey).slice(kvConst.ANALYSIS_ECHARTS.length))) };
	},

	analysisCacheEnabled(c) {
		return c.env.analysis_cache === true || c.env.analysis_cache === 'true';
	}
};

export default analysisService;

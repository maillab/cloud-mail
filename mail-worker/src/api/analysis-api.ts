import type { Hono } from 'hono';
import type { AppEnvironment } from '../types/context';
import analysisService from '../service/analysis-service';
import result from '../model/result';

export function registerAnalysisApi(app: Hono<AppEnvironment>) {
	app.get('/analysis/echarts', async (c) => {
		const data = await analysisService.echarts(c, c.req.query());
		return c.json(result.ok(data));
	})
}

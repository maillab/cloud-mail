import type { Hono } from 'hono';
import type { AppEnvironment } from '../types/context';
import result from '../model/result';
import settingService from '../service/setting-service';
import type { SettingsPatch, BackgroundInput, BlacklistInput } from '../types/settings';

export function registerSettingApi(app: Hono<AppEnvironment>) {
	app.put('/setting/set', async (c) => {
		await settingService.set(c, await c.req.json<SettingsPatch>());
		return c.json(result.ok());
	});

	app.get('/setting/query', async (c) => {
		const setting = await settingService.get(c);
		return c.json(result.ok(setting));
	});

	app.get('/setting/websiteConfig', async (c) => {
		const setting = await settingService.websiteConfig(c);
		return c.json(result.ok(setting));
	})

	app.put('/setting/setBackground', async (c) => {
		const key = await settingService.setBackground(c, await c.req.json<BackgroundInput>());
		return c.json(result.ok(key));
	});

	app.delete('/setting/deleteBackground', async (c) => {
		await settingService.deleteBackground(c);
		return c.json(result.ok());
	});

	app.put('/setting/setBlacklist', async (c) => {
		const setting = await settingService.setBlacklist(c, await c.req.json<BlacklistInput>());
		return c.json(result.ok(setting));
	})
}

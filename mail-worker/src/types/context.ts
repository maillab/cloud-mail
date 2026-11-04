import type { Context } from 'hono';
import type { WorkerEnv } from './env';
import type { SessionUser } from './auth';
import type { SettingsCache } from './settings';

export interface AppVariables {
	user: SessionUser | undefined;
	setting: SettingsCache | undefined;
}
export type AppEnvironment = { Bindings: WorkerEnv; Variables: AppVariables };
export type HttpContext = Context<AppEnvironment>;
export type EnvContext = { env: WorkerEnv };
export type DatabaseContext = { env: Pick<WorkerEnv, 'db' | 'orm_log'> };
export type ConfigReadContext = EnvContext & Partial<Pick<HttpContext, 'get' | 'set'>>;
export type ConfigWriteContext = EnvContext & Pick<HttpContext, 'set'>;
export type RequestMetadataContext = EnvContext & Pick<HttpContext, 'req'>;

/** Required mailbox bindings; the commented deployment template must be configured before publishing. */
export interface WorkerEnv {
	db: D1Database;
	kv: KVNamespace;
	assets: Fetcher;
	r2?: R2Bucket;
	ai?: Ai;
	email?: SendEmail;
	domain: string[] | string;
	admin: string;
	jwt_secret: string;
	orm_log?: boolean;
	analysis_cache?: boolean | string;
	ai_model?: string;
	project_link?: boolean | string;
}

export type Env = WorkerEnv;

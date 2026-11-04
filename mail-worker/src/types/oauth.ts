import type { oauth } from '../entity/oauth';

export interface OAuthCodeRequest {
	code: string;
	redirectUri: string;
}

export interface OAuthBindRequest {
	email: string;
	setupToken?: string;
	code?: string;
}

export type OAuthRow = typeof oauth.$inferSelect;
export type OAuthLoginResult =
	| { userInfo: OAuthRow; token: null; setupToken: string; expiresAt: number }
	| { userInfo: OAuthRow; token: string };

/** Preserve nullable/missing client settings and their existing wire coercion. */
export interface OAuthClientConfig {
	clientId: string | null | undefined;
	clientSecret: string | null | undefined;
}

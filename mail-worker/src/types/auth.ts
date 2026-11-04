import type user from '../entity/user';

export type SessionUser = typeof user.$inferSelect;
export interface SessionRecord {
	user: SessionUser;
	tokens: string[];
	refreshTime: string;
}

export type OAuthPlatform = 'google' | 'github' | 'linuxdo';
export interface JwtPayload {
	iat?: number;
	exp?: number;
	[key: string]: unknown;
}
export interface SessionClaims extends JwtPayload {
	userId: number;
	token: string;
}
export interface OAuthSetupClaims extends JwtPayload {
	purpose: 'oauth-setup';
	oauthId: number;
	platform: OAuthPlatform;
	subject: string;
	exp: number;
}

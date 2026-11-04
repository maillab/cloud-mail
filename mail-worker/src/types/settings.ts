import type setting from '../entity/setting';

export type SettingsRow = typeof setting.$inferSelect;
export type SettingsPatch = Partial<Omit<typeof setting.$inferInsert, 'resendTokens' | 'emailPrefixFilter' | 'aiCodeFilter'>> & {
	resendTokens?: unknown;
	emailPrefixFilter?: string | string[];
	aiCodeFilter?: string | string[];
};
export interface BackgroundInput { background?: string | null }
export interface BlacklistInput { blackSubject?: string; blackContent?: string; blackFrom?: string }
export type StoredSettings = Omit<SettingsRow, 'resendTokens'> & { resendTokens: unknown };
export type SettingsCache = Partial<Omit<StoredSettings, 'emailPrefixFilter' | 's3AccessKey' | 's3SecretKey' | 'tgBotToken'>> & {
	emailPrefixFilter?: string | string[];
	s3AccessKey?: string | null;
	s3SecretKey?: string | null;
	tgBotToken?: string | null;
	domainList?: string[];
	projectLink?: boolean;
	hasR2?: boolean;
	hasCfEmail?: boolean;
	regVerifyOpen?: boolean;
	addVerifyOpen?: boolean;
	storageType?: 'S3' | 'R2' | 'KV';
};

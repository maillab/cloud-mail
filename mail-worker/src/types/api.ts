export type ScalarId = string | number;
export type QueryParams = Record<string, string | undefined>;
export interface LegacySuccess<T> {
	code: 200;
	message: 'success';
	data: T | null;
}
export interface LegacyFailure {
	// Foreign integration errors historically expose their own code verbatim.
	code: unknown;
	message: string | undefined;
}

export type LegacyResponse<T> = LegacySuccess<T> | LegacyFailure;

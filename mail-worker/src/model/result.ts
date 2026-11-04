import type { LegacyFailure, LegacySuccess } from '../types/api';
const result = {
	ok<T>(data?: T): LegacySuccess<T> {
		return { code: 200, message: 'success', data: data ? data : null };
	},
	fail(message?: string, code: unknown = 500): LegacyFailure {
		return { code, message };
	}
};
export default result;

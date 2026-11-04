/** Decode only property access, without treating any signed JSON as a session. */
export function sessionFields(value: unknown): { userId: unknown; token: unknown } {
	if (typeof value !== 'object' || value === null) return { userId: undefined, token: undefined };
	const fields = value as Record<string, unknown>;
	return { userId: fields.userId, token: fields.token };
}

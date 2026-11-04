import { sql } from 'drizzle-orm';
import type { ScalarId } from '../types/api';

// Query IDs historically reach SQLite as strings. Preserve that binding value
// instead of coercing it to Number while satisfying numeric-column overloads.
export const boundId = (value: ScalarId | null | undefined) => sql`${sql.param(value)}`;

export const boundIds = (values: readonly (ScalarId | null)[]) => values.length
	? sql`(${sql.join(values.map(boundId), sql`, `)})`
	: [];

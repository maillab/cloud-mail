// Preserve the existing TypeError contract for a missing legacy database row.
// Call at the first property read, rather than changing query or auth behavior.
export function requiredRow<T extends object>(row: T | null | undefined, property: keyof T): T {
	if (row == null) throw new TypeError(`Cannot read properties of ${row === null ? 'null' : 'undefined'} (reading '${String(property)}')`);
	return row;
}

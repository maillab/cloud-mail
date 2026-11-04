export function stringList(value: string | string[] | null | undefined, name: string, method: string): string[] {
	if (value == null) throw new TypeError(`Cannot read properties of ${String(value)} (reading '${method}')`);
	if (!Array.isArray(value)) throw new TypeError(`${name}.${method} is not a function`);
	return value;
}

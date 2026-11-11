function normalize(address) {
	return String(address ?? '').trim().toLowerCase();
}

// 32-bit FNV-1a hash of the normalized address, mapped to 1..8
export function mailboxColorIndex(address) {
	const value = normalize(address);
	if (!value) return 1;
	let hash = 0x811c9dc5;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return (hash % 8) + 1;
}

export function senderInitial(name, address) {
	const source = String(name ?? '').trim() || String(address ?? '').trim();
	if (!source) return '?';
	const first = Array.from(source)[0];
	return /^[a-z]$/i.test(first) ? first.toUpperCase() : first;
}

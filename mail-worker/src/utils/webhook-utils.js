const encoder = new TextEncoder();

function base64ToBytes(value) {
	return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

function constantTimeEqual(a, b) {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export async function verifySvixWebhook({ secret, payload, id, timestamp, signature, toleranceSeconds = 300 }) {
	if (!secret || !id || !timestamp || !signature) return false;
	const timestampNumber = Number(timestamp);
	if (!Number.isFinite(timestampNumber)) return false;
	if (Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > toleranceSeconds) return false;

	const secretValue = secret.startsWith('whsec_') ? secret.slice(6) : secret;
	let secretBytes;
	try {
		secretBytes = base64ToBytes(secretValue);
	} catch {
		return false;
	}

	const key = await crypto.subtle.importKey(
		'raw',
		secretBytes,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signedContent = `${id}.${timestamp}.${payload}`;
	const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(signedContent));
	const expected = btoa(String.fromCharCode(...new Uint8Array(digest)));

	return signature.split(/\s+/).some(item => {
		const [version, candidate] = item.split(',');
		return version === 'v1' && candidate && constantTimeEqual(candidate, expected);
	});
}

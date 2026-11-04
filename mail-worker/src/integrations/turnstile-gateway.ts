interface TurnstileProof {
	secret: string | null | undefined;
	token: string;
	ip: string | undefined;
}

/** Provider transport/JSON boundary; the service owns translated business errors. */
export async function verifyTurnstile(proof: TurnstileProof): Promise<boolean> {
	const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
		method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ secret: String(proof.secret), response: proof.token, remoteip: String(proof.ip) })
	});
	const result: unknown = await response.json();
	// Retain null failure, primitive rejection and the original truthy success semantics.
	if (result === null) throw new TypeError("Cannot read properties of null (reading 'success')");
	return Boolean(typeof result === 'object' && 'success' in result ? result.success : undefined);
}

/** Workers AI protocol and untrusted response decoder, without mailbox/database context. */
export async function extractVerificationCode(ai: Ai, model: string, subject: string, body: string): Promise<string> {
	const result: unknown = await ai.run(model, {
		messages: [
			{ role: 'system', content: 'You extract verification codes from emails. Return only JSON like {"code":"12345678"} or {"code":""}. The code must be 8 characters or fewer and must not contain spaces. If the code is longer than 8 characters or contains spaces, return {"code":""}. Do not explain.' },
			{ role: 'user', content: `Subject: ${subject}\n\n${body}` }
		], temperature: 0, max_tokens: 32
	});
	const content = typeof result === 'string' ? result : result && typeof result === 'object' && 'response' in result ? result.response || '' : '';
	const json: unknown = typeof content === 'string' ? JSON.parse(content) : content;
	if (!json || typeof json !== 'object' || !('code' in json) || typeof json.code !== 'string') return '';
	if (json.code.length > 8 || /\s/.test(json.code)) return '';
	return json.code;
}

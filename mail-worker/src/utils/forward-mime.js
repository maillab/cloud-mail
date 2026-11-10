function encodeMimeWord(value = '') {
	const text = String(value).replace(/[\r\n]+/g, ' ');
	if (!text || /^[\x20-\x7E]*$/.test(text)) {
		return text;
	}
	const bytes = new TextEncoder().encode(text);
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return `=?UTF-8?B?${btoa(binary)}?=`;
}

function formatMailbox(address, name) {
	if (!address) {
		return '';
	}
	if (!name || name === address) {
		return address;
	}
	const encoded = encodeMimeWord(name);
	if (encoded.startsWith('=?')) {
		return `${encoded} <${address}>`;
	}
	if (/[()<>[\]:;@\\,"]/.test(name)) {
		return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" <${address}>`;
	}
	return `${encoded} <${address}>`;
}

function toBase64Body(content) {
	const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary).replace(/.{1,76}/g, '$&\r\n').replace(/\r\n$/, '');
}

function mimePart(contentType, body, extraHeaders = []) {
	return [
		`Content-Type: ${contentType}`,
		'Content-Transfer-Encoding: base64',
		...extraHeaders,
		'',
		toBase64Body(body)
	].join('\r\n');
}

function filenameParam(filename = 'file') {
	if (/^[\x20-\x7E]*$/.test(filename) && !/["\\]/.test(filename)) {
		return `filename="${filename}"`;
	}
	return `filename*=UTF-8''${encodeURIComponent(filename)}`;
}

const forwardMime = {

	// 信头 To 用 params.receiveEmail，调用方把已验证地址作为信封收件人传入。
	build(params) {
		const recipients = (params.receiveEmail || []).map(item => {
			if (typeof item === 'string') {
				return item;
			}
			return formatMailbox(item.address || item.email, item.name);
		}).filter(Boolean);
		const headers = [
			`From: ${formatMailbox(params.accountEmail, params.name)}`,
			`To: ${recipients.join(', ')}`,
			`Subject: ${encodeMimeWord(params.subject || '')}`,
			'MIME-Version: 1.0'
		];
		if (params.sendType === 'reply' && params.messageId) {
			headers.push(`In-Reply-To: ${params.messageId}`, `References: ${params.messageId}`);
		}

		const alt = `alt_${crypto.randomUUID().replace(/-/g, '')}`;
		const alternative = [
			`--${alt}`,
			mimePart('text/plain; charset=UTF-8', params.text || ''),
			...(params.html ? [`--${alt}`, mimePart('text/html; charset=UTF-8', params.html)] : []),
			`--${alt}--`,
			''
		].join('\r\n');
		const attachments = params.attachments || [];

		if (attachments.length === 0) {
			headers.push(`Content-Type: multipart/alternative; boundary="${alt}"`);
			return `${headers.join('\r\n')}\r\n\r\n${alternative}`;
		}

		const mixed = `mix_${crypto.randomUUID().replace(/-/g, '')}`;
		headers.push(`Content-Type: multipart/mixed; boundary="${mixed}"`);
		const parts = [
			`--${mixed}`,
			`Content-Type: multipart/alternative; boundary="${alt}"`,
			'',
			alternative.replace(/\r\n$/, '')
		];
		for (const attachment of attachments) {
			const extra = [`Content-Disposition: ${attachment.disposition || 'attachment'}; ${filenameParam(attachment.filename)}`];
			if (attachment.contentId) {
				extra.push(`Content-ID: <${attachment.contentId}>`);
			}
			parts.push(`--${mixed}`, mimePart(attachment.type || 'application/octet-stream', attachment.content, extra));
		}
		parts.push(`--${mixed}--`, '');
		return `${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}`;
	},

	async send(binding, params, envelopeTo) {
		const { EmailMessage } = await import('cloudflare:email');
		const message = new EmailMessage(params.accountEmail, envelopeTo, this.build(params));
		const result = await binding.send(message);
		return { data: { id: result?.messageId } };
	}

};

export default forwardMime;

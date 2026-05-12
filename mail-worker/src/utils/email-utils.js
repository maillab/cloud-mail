import { parseHTML } from 'linkedom';

function decodePunycodeLabel(encoded) {
	const base = 36, tmin = 1, tmax = 26, skew = 38, damp = 700, initialBias = 72, initialN = 128;

	function decodeDigit(cp) {
		const n = cp.charCodeAt(0);
		if (n >= 0x41 && n <= 0x5A) return n - 0x41;
		if (n >= 0x61 && n <= 0x7A) return n - 0x61;
		if (n >= 0x30 && n <= 0x39) return n - 0x30 + 26;
		throw new Error('Invalid punycode digit');
	}

	function adapt(delta, numPoints, firstTime) {
		delta = firstTime ? Math.floor(delta / damp) : Math.floor(delta / 2);
		delta += Math.floor(delta / numPoints);
		let k = 0;
		while (delta > Math.floor(((base - tmin) * tmax) / 2)) {
			delta = Math.floor(delta / (base - tmin));
			k += base;
		}
		return k + Math.floor((((base - tmin + 1) * delta) / (delta + skew)));
	}

	const delimIndex = encoded.lastIndexOf('-');
	let output = [];
	if (delimIndex >= 0) {
		output = encoded.slice(0, delimIndex).split('').map(c => c.charCodeAt(0));
		encoded = encoded.slice(delimIndex + 1);
	}

	let i = 0, n = initialN, bias = initialBias;

	while (encoded.length > 0) {
		const prevI = i;
		let w = 1;
		for (let k = base; ; k += base) {
			const digit = decodeDigit(encoded[0]);
			encoded = encoded.slice(1);
			i += digit * w;
			const t = k <= bias ? tmin : k >= bias + tmax ? tmax : k - bias;
			if (digit < t) break;
			w *= base - t;
		}

		const outLen = output.length + 1;
		bias = adapt(i - prevI, outLen, prevI === 0);
		n += Math.floor(i / outLen);
		i %= outLen;
		output.splice(i, 0, n);
		i++;
	}

	return String.fromCharCode(...output);
}

const emailUtils = {

	getDomain(email) {
		if (typeof email !== 'string') return '';
		const parts = email.split('@');
		return parts.length === 2 ? parts[1] : '';
	},

	getName(email) {
		if (typeof email !== 'string') return '';
		const parts = email.trim().split('@');
		return parts.length === 2 ? parts[0] : '';
	},

	formatText(text) {
		if (!text) return ''
		return text
			.split('\n')
			.map(line => {
				return line.replace(/[\u200B-\u200F\uFEFF\u034F\u200B-\u200F\u00A0\u3000\u00AD]/g, '')
					.replace(/\s+/g, ' ')
					.trim();
			})
			.join('\n')
			.replace(/\n{3,}/g, '\n')
			.trim();
	},

	htmlToText(content) {
		if (!content) return ''
		try {
			const wrappedContent = content.includes('<body')
				? content
				: `<!DOCTYPE html><html><body>${content}</body></html>`;
			const { document } = parseHTML(wrappedContent);
			document.querySelectorAll('style, script, title').forEach(el => el.remove());
			let text = document.body.innerText;
			return this.formatText(text);
		} catch (e) {
			console.error(e)
			return ''
		}
	},

	toPunycode(domain) {
		if (typeof domain !== 'string') return '';
		try {
			return new URL('http://' + domain).hostname;
		} catch {
			return domain;
		}
	},

	getPunycodeDomain(email) {
		const domain = this.getDomain(email);
		return this.toPunycode(domain);
	},

	toPunycodeEmail(email) {
		if (typeof email !== 'string') return '';
		const parts = email.split('@');
		if (parts.length !== 2) return email;
		return parts[0] + '@' + this.toPunycode(parts[1]);
	},

	fromPunycode(domain) {
		if (typeof domain !== 'string') return '';
		if (!domain.includes('xn--')) return domain;
		try {
			const parts = domain.split('.');
			return parts.map(part => {
				if (part.startsWith('xn--')) {
					return decodePunycodeLabel(part.slice(4));
				}
				return part;
			}).join('.');
		} catch {
			return domain;
		}
	},

	fromPunycodeEmail(email) {
		if (typeof email !== 'string') return '';
		const parts = email.split('@');
		if (parts.length !== 2) return email;
		return this.fromPunycode(parts[0]) + '@' + this.fromPunycode(parts[1]);
	},

	convertEmailsToUnicode(data) {
		if (Array.isArray(data)) {
			return data.map(item => this.convertEmailsToUnicode(item));
		}
		if (data && typeof data === 'object') {
			const result = {};
			for (const key of Object.keys(data)) {
				const value = data[key];
				if (['email', 'sendEmail', 'toEmail', 'userEmail', 'send_email', 'to_email', 'from', 'to', 'address'].includes(key) && typeof value === 'string' && value.includes('@')) {
					result[key] = this.fromPunycodeEmail(value);
				} else if (key === 'recipient' && typeof value === 'string') {
					try {
						const parsed = JSON.parse(value);
						result[key] = JSON.stringify(this.convertEmailsToUnicode(parsed));
					} catch {
						result[key] = value;
					}
				} else {
					result[key] = this.convertEmailsToUnicode(value);
				}
			}
			return result;
		}
		return data;
	}
};

export default emailUtils;

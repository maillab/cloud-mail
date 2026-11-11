const copy = {
	zh: {
		subject: '验证转发邮箱',
		line1: (accountEmail) => `${accountEmail} 申请把收到的邮件转发到这个地址。`,
		line2: (code) => `验证码：${code}，30 分钟内有效。`,
		line3: '如果不是你本人操作，请忽略这封邮件。'
	},
	en: {
		subject: 'Verify your forwarding address',
		line1: (accountEmail) => `${accountEmail} requested to forward incoming mail to this address.`,
		line2: (code) => `Verification code: ${code} (valid for 30 minutes).`,
		line3: 'If you did not request this, please ignore this email.'
	}
};

export default function forwardVerifyTemplate({ accountEmail, code, lang }) {
	const s = copy[lang === 'en' ? 'en' : 'zh'];
	const line1 = s.line1(accountEmail);
	const line2 = s.line2(code);
	const boldLine2 = line2.replace(code, `<strong>${code}</strong>`);
	return {
		subject: s.subject,
		text: [line1, line2, s.line3].join('\n'),
		html: `<p>${line1}</p><p>${boldLine2}</p><p>${s.line3}</p>`
	};
}

export function plainMail(subject = 'Contract inbound', to = 'recipient@example.test', text = 'The local fixture body') {
	return `From: Sender <sender@external.test>\r\nTo: Recipient <${to}>\r\nSubject: ${subject}\r\nMessage-ID: <${subject.replace(/\W/g, '-')}@external.test>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}\r\n`;
}

// Native PostalMime input: ordinary binary attachment and a CID body image.
export function multipartMail(subject = 'Contract MIME', to = 'recipient@example.test') {
	return `From: Sender <sender@external.test>\r\nTo: Recipient <${to}>\r\nSubject: ${subject}\r\nMessage-ID: <fixture-mime@external.test>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="fixture-boundary"\r\n\r\n` +
		`--fixture-boundary\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Fixture body<img src="cid:fixture-image"></p>\r\n` +
		`--fixture-boundary\r\nContent-Type: application/octet-stream; name="binary.bin"\r\nContent-Disposition: attachment; filename="binary.bin"\r\nContent-Transfer-Encoding: base64\r\n\r\nAQID\r\n` +
		`--fixture-boundary\r\nContent-Type: image/png; name="inline.png"\r\nContent-Disposition: inline; filename="inline.png"\r\nContent-ID: <fixture-image>\r\nContent-Transfer-Encoding: base64\r\n\r\nBAUG\r\n--fixture-boundary--\r\n`;
}

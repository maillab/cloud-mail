// Cloud Mail -> Alibaba Cloud DirectMail SMTP adapter.
// Step 1: plain-text/HTML messages only. Attachments deliberately fail closed
// until the Cloud Mail attachment representation is integrated and tested.
// Requires Cloudflare Workers TCP socket API (cloudflare:sockets).
import { connect } from 'cloudflare:sockets';

const encoder = new TextEncoder();

function emailAddress(value) {
  const address = String(value || '').trim();
  if (!/^[^\s<>@\r\n]+@[^\s<>@\r\n]+\.[^\s<>@\r\n]+$/.test(address)) {
    throw new Error('Invalid email address');
  }
  return address;
}

function headerValue(value) {
  return String(value ?? '').replace(/[\r\n\0]/g, ' ').trim();
}

function b64Bytes(bytes) {
  let output = '';
  for (let i = 0; i < bytes.length; i += 0x4000) {
    output += String.fromCharCode(...bytes.subarray(i, i + 0x4000));
  }
  return btoa(output);
}

function b64Utf8(value) {
  return b64Bytes(encoder.encode(String(value ?? '')));
}

function mimeHeader(value) {
  const input = headerValue(value);
  if (/^[\x20-\x7e]*$/.test(input)) return input;
  // RFC 2047: fold encoded words without splitting UTF-8 characters.
  const chunks = [];
  let chunk = '';
  for (const char of input) {
    if (encoder.encode(chunk + char).length > 42 && chunk) {
      chunks.push(`=?UTF-8?B?${b64Utf8(chunk)}?=`);
      chunk = '';
    }
    chunk += char;
  }
  if (chunk) chunks.push(`=?UTF-8?B?${b64Utf8(chunk)}?=`);
  return chunks.join('\r\n ');
}

function wrapBase64(value) {
  return b64Utf8(value).match(/.{1,76}/g)?.join('\r\n') || '';
}

function makeEmail({ from, replyTo, to, name, subject, text, html, sendType, messageId }) {
  const id = `<${crypto.randomUUID()}@${from.split('@')[1]}>`;
  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${id}`,
    `From: ${name ? `${mimeHeader(name)} ` : ''}<${from}>`,
    `To: ${to.map(addr => `<${addr}>`).join(', ')}`,
    `Reply-To: <${replyTo}>`,
    `Subject: ${mimeHeader(subject)}`,
    'MIME-Version: 1.0'
  ];
  if (sendType === 'reply' && messageId) {
    const clean = headerValue(messageId);
    if (/^<[^<>\r\n]+>$/.test(clean)) {
      headers.push(`In-Reply-To: ${clean}`);
      headers.push(`References: ${clean}`);
    }
  }
  let body;
  const plainText = text || (html ? String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ') : '');
  if (html) {
    const boundary = `alt_${crypto.randomUUID().replace(/-/g, '')}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(plainText),
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(html),
      `--${boundary}--`
    ].join('\r\n');
  } else {
    headers.push('Content-Type: text/plain; charset=UTF-8');
    headers.push('Content-Transfer-Encoding: base64');
    body = wrapBase64(plainText);
  }
  return { id, raw: `${headers.join('\r\n')}\r\n\r\n${body}\r\n` };
}

class SmtpConnection {
  constructor(socket) {
    this.socket = socket;
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
    this.decoder = new TextDecoder();
    this.buffer = '';
  }
  async reply(expected) {
    let response = '';
    let code = '';
    while (true) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) {
        const { value, done } = await this.reader.read();
        if (done) throw new Error('SMTP server closed the connection');
        this.buffer += this.decoder.decode(value, { stream: true });
        if (this.buffer.length + response.length > 32768) {
          throw new Error('SMTP response too large');
        }
        continue;
      }
      const line = this.buffer.slice(0, newline).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newline + 1);
      response += `${line}\n`;
      if (!/^\d{3}[ -]/.test(line)) throw new Error('Invalid SMTP response');
      code = line.slice(0, 3);
      if (line[3] === ' ') break;
    }
    if (!expected.includes(Number(code))) {
      // Avoid returning full SMTP replies that may contain private addresses.
      throw new Error(`SMTP command rejected (${code})`);
    }
    return response;
  }
  async command(text, expected) {
    await this.writer.write(encoder.encode(`${text}\r\n`));
    return this.reply(expected);
  }
  async data(raw) {
    // SMTP dot-stuffing: double a leading dot on every content line.
    const stuffed = raw.replace(/\r?\n/g, '\r\n').split('\r\n').map(
      line => line.startsWith('.') ? `.${line}` : line
    ).join('\r\n');
    await this.writer.write(encoder.encode(`${stuffed.endsWith('\r\n') ? stuffed : stuffed + '\r\n'}.\r\n`));
    return this.reply([250]);
  }
  async close() {
    try { await this.command('QUIT', [221, 250]); } catch { /* best effort */ }
    try { this.reader.releaseLock(); } catch { /* best effort */ }
    try { this.writer.releaseLock(); } catch { /* best effort */ }
    try { this.socket.close(); } catch { /* best effort */ }
  }
}

export async function sendAliyunSmtp(env, params) {
  const host = String(env.ALIYUN_SMTP_HOST || '').trim();
  const port = Number(env.ALIYUN_SMTP_PORT || 465);
  const username = emailAddress(env.ALIYUN_SMTP_USER);
  const password = String(env.ALIYUN_SMTP_PASSWORD || '');
  const replyTo = emailAddress(env.ALIYUN_REPLY_TO);
  if (!host || !password || port !== 465 || !/^[a-zA-Z0-9.-]+$/.test(host)) {
    throw new Error('Invalid Aliyun SMTP configuration');
  }
  if (params.attachments?.length) {
    throw new Error('Aliyun SMTP attachments are not enabled yet');
  }
  const to = (params.receiveEmail || []).map(emailAddress);
  if (!to.length || to.length > 50) throw new Error('Invalid recipient count');
  const message = makeEmail({
    from: username,
    replyTo,
    to,
    name: params.name,
    subject: params.subject,
    text: params.text,
    html: params.html,
    sendType: params.sendType,
    messageId: params.messageId
  });
  const socket = connect({ hostname: host, port }, { secureTransport: 'on' });
  const smtp = new SmtpConnection(socket);
  try {
    await socket.opened;
    await smtp.reply([220]);
    await smtp.command('EHLO cloud-mail', [250]);
    await smtp.command('AUTH LOGIN', [334]);
    await smtp.command(b64Utf8(username), [334]);
    await smtp.command(b64Utf8(password), [235]);
    await smtp.command(`MAIL FROM:<${username}>`, [250]);
    for (const recipient of to) {
      await smtp.command(`RCPT TO:<${recipient}>`, [250, 251]);
    }
    await smtp.command('DATA', [354]);
    await smtp.data(message.raw);
    return { id: message.id };
  } finally {
    await smtp.close();
  }
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTelegramInlineKeyboard, normalizeTelegramChatIds, telegramPlainText } from '../src/utils/telegram-utils.js';

assert.deepEqual(normalizeTelegramChatIds('123,-100123,123,bad'), ['123', '-100123']);
assert.deepEqual(buildTelegramInlineKeyboard('https://mail.example.com/message/1', '123456'), {
  inline_keyboard: [
    [{ text: 'View', url: 'https://mail.example.com/message/1' }],
    [{ text: '123456', copy_text: { text: '123456' } }]
  ]
});
assert.equal(buildTelegramInlineKeyboard('http://insecure.example.com'), undefined);
assert.equal(telegramPlainText('<b>Hello</b> &lt;x&gt; &amp; ok'), 'Hello <x> & ok');

const templateSource = readFileSync(new URL('../src/template/email-msg.js', import.meta.url), 'utf8');
assert.match(templateSource, /buildTelegramEmailMessages/, 'Telegram email template must support multi-message bodies');
assert.doesNotMatch(templateSource, /truncateText\(/, 'Telegram forwarding must not truncate long email bodies');
assert.match(templateSource, /邮件正文（续）/, 'Long Telegram email bodies must use continuation messages');

const tgSource = readFileSync(new URL('../src/service/telegram-service.js', import.meta.url), 'utf8');
assert.doesNotMatch(tgSource, /web_app\s*:/, 'Telegram forwarding must not use private-chat-only web_app buttons');
assert.match(tgSource, /sendDocument/, 'Telegram forwarding must send stored attachments');
assert.match(tgSource, /selectByEmailIds/, 'Telegram forwarding must load persisted mail attachments');
assert.match(tgSource, /fallback plain text/, 'Telegram summary must have a no-markup fallback');
assert.match(tgSource, /messageTexts/, 'Telegram forwarding must send every generated message chunk');

const emailSource = readFileSync(new URL('../src/email/email.js', import.meta.url), 'utf8');
assert.match(emailSource, /message\.forward\(target\)/, 'Server-side external forwarding must preserve the original raw MIME message');

const securitySource = readFileSync(new URL('../src/security/security.js', import.meta.url), 'utf8');
assert.match(securitySource, /POST['"]?,\s*['"]\/setting\/testTelegram/, 'Telegram test endpoint must require setting:set permission');

console.log('Telegram forwarding contract tests passed.');

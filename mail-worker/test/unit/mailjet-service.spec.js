import { afterEach, describe, expect, it, vi } from 'vitest';
import mailjetService from '../../src/service/mailjet-service';

const credentials = { apiKey: 'test-key', secretKey: 'test-secret' };
const params = {
	accountEmail: 'sender@example.com', name: '测试发件人',
	receiveEmail: ['one@example.net', 'two@example.net'],
	subject: '测试邮件', text: 'Hello', html: '<p>Hello</p>'
};

afterEach(() => vi.unstubAllGlobals());

describe('Mailjet Send API v3.1', () => {
	it('maps recipients, reply headers, ordinary and inline attachments', () => {
		const message = mailjetService.buildMessage({
			...params, sendType: 'reply', messageId: '<original@example.net>',
			attachments: [
				{ filename: 'file.txt', contentType: 'text/plain', content: 'aGVsbG8=' },
				{ filename: 'image.png', contentType: 'image/png', content: 'aGVsbG8=', contentId: '<image-id>' }
			]
		});
		expect(message).toEqual({
			From: { Email: params.accountEmail, Name: params.name },
			To: params.receiveEmail.map(Email => ({ Email })),
			Subject: params.subject, TextPart: params.text, HTMLPart: params.html,
			Headers: { 'In-Reply-To': '<original@example.net>', References: '<original@example.net>' },
			Attachments: [{ Filename: 'file.txt', ContentType: 'text/plain', Base64Content: 'aGVsbG8=' }],
			InlinedAttachments: [{ Filename: 'image.png', ContentType: 'image/png', Base64Content: 'aGVsbG8=', ContentID: 'image-id' }]
		});
	});

	it('omits absent body parts, attachments and reply headers', () => {
		const message = mailjetService.buildMessage({ ...params, text: '', sendType: 'reply' });
		expect(message).not.toHaveProperty('TextPart');
		expect(message).not.toHaveProperty('Headers');
		expect(message).not.toHaveProperty('Attachments');
		expect(message).not.toHaveProperty('InlinedAttachments');
	});

	it('authenticates with both keys and sends live messages by default', async () => {
		const results = [{ Status: 'success', To: [{ MessageUUID: 'uuid' }] }];
		const fetchMock = vi.fn().mockResolvedValue(Response.json({ Messages: results }));
		vi.stubGlobal('fetch', fetchMock);
		const messages = [mailjetService.buildMessage(params)];
		expect(await mailjetService.send(credentials, messages)).toEqual(results);
		const [url, request] = fetchMock.mock.calls[0];
		expect(url).toBe('https://api.mailjet.com/v3.1/send');
		expect(request.method).toBe('POST');
		expect(request.headers.Authorization).toBe(`Basic ${btoa('test-key:test-secret')}`);
		expect(JSON.parse(request.body)).toEqual({ Messages: messages });
	});

	it('puts SandboxMode at the payload root only when explicitly requested', async () => {
		const fetchMock = vi.fn().mockResolvedValue(Response.json({ Messages: [{ Status: 'success' }] }));
		vi.stubGlobal('fetch', fetchMock);
		await mailjetService.send(credentials, [mailjetService.buildMessage(params)], { sandbox: true });
		expect(JSON.parse(fetchMock.mock.calls[0][1].body).SandboxMode).toBe(true);
	});

	it('preserves mixed results even when the HTTP status indicates failure', async () => {
		const Messages = [{ Status: 'success' }, { Status: 'error', Errors: [{ ErrorMessage: 'Invalid sender' }] }];
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ Messages }, { status: 400 })));
		expect(await mailjetService.send(credentials, [])).toEqual(Messages);
		expect(mailjetService.errorMessage(Messages[1])).toBe('Invalid sender');
	});

	it('reports authentication and non-JSON gateway failures', async () => {
		vi.stubGlobal('fetch', vi.fn()
			.mockResolvedValueOnce(Response.json({ ErrorMessage: 'Unauthorized' }, { status: 401 }))
			.mockResolvedValueOnce(new Response('Bad gateway', { status: 502 })));
		await expect(mailjetService.send(credentials, [])).rejects.toThrow('Unauthorized');
		await expect(mailjetService.send(credentials, [])).rejects.toThrow('Mailjet request failed (HTTP 502)');
	});
});

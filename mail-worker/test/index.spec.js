import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src';
import emailService from '../src/service/email-service';

describe('Hello World worker', () => {
	it('serves the app shell (unit style)', async () => {
		const request = new Request('http://example.com');
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('<title>Cloud Mail</title>');
	});

	it('serves the app shell (integration style)', async () => {
		const response = await SELF.fetch('http://example.com');
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('<title>Cloud Mail</title>');
	});
});

describe('email sending', () => {
	it('passes cc recipients to the Cloudflare Email binding', async () => {
		let sendForm;
		const c = {
			env: {
				email: {
					send: async (form) => {
						sendForm = form;
						return { messageId: 'message-id' };
					}
				}
			}
		};

		const result = await emailService.sendByCloudflareEmail(c, {
			name: 'Angel Zhao',
			accountEmail: 'angel.zhao@microfb.org',
			receiveEmail: ['ravi.chandran@medicalgorithmics.com'],
			ccEmail: ['c.guzman@medicalgorithmics.com'],
			subject: 'Re: Partnership Inquiry',
			text: 'Thanks',
			html: '<p>Thanks</p>',
			attachments: []
		});

		expect(sendForm.cc).toEqual(['c.guzman@medicalgorithmics.com']);
		expect(result.data.id).toBe('message-id');
	});
});

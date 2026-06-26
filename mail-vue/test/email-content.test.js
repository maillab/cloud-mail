import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	attachmentDisplayName,
	attachmentDownloadUrl,
	formatEmailBody,
	htmlToVisibleText,
	isCalendarAttachment
} from '../src/utils/email-content.js';
import { getExtName } from '../src/utils/file-utils.js';

describe('email content utilities', () => {
	it('falls back to text when html has no visible body', () => {
		const body = formatEmailBody({
			content: '<html><head><title>invite</title></head><body><div style="display:none">hidden</div></body></html>',
			text: 'Spotkanie w Microsoft Teams'
		});

		assert.deepEqual(body, {
			type: 'text',
			value: 'Spotkanie w Microsoft Teams'
		});
	});

	it('keeps renderable html', () => {
		const body = formatEmailBody({
			content: '<p>Hello&nbsp;there</p>',
			text: 'plain fallback'
		});

		assert.equal(body.type, 'html');
		assert.equal(htmlToVisibleText(body.value), 'Hello there');
	});

	it('detects nameless text/calendar attachments without crashing on missing filenames', () => {
		assert.equal(getExtName(null), '');
		assert.equal(isCalendarAttachment({ filename: null, mimeType: 'text/calendar' }), true);
	});

	it('builds a worker download URL with the displayed attachment filename', () => {
		const attachment = { key: 'attachments/calendar-key', filename: null, mimeType: 'text/calendar' };

		assert.equal(attachmentDisplayName(attachment), 'calendar.ics');
		assert.equal(
			attachmentDownloadUrl(attachment, '/api'),
			'/api/oss/attachments/calendar-key?filename=calendar.ics'
		);
	});
});

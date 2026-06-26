import { describe, expect, it } from 'vitest';
import { attachmentContentDisposition, attachmentFilename } from '../src/utils/attachment-utils.js';

describe('attachment utils', () => {
	it('uses calendar.ics when a calendar attachment has no filename', () => {
		const attachment = { filename: null, mimeType: 'text/calendar' };

		expect(attachmentFilename(attachment)).toBe('calendar.ics');
		expect(attachmentContentDisposition(attachment)).toBe('attachment; filename="calendar.ics"; filename*=UTF-8\'\'calendar.ics');
	});

	it('does not emit filename=null for missing generic filenames', () => {
		const attachment = { filename: null, mimeType: 'application/octet-stream' };

		expect(attachmentContentDisposition(attachment)).toBe('attachment; filename="attachment"; filename*=UTF-8\'\'attachment');
	});
});

import { isCalendarAttachment } from './calendar-utils';

export function attachmentFilename(attachment = {}) {
	const filename = String(attachment.filename || '').trim();

	if (filename && !['null', 'undefined'].includes(filename.toLowerCase())) {
		return filename;
	}

	if (isCalendarAttachment(attachment)) {
		return 'calendar.ics';
	}

	return 'attachment';
}

export function attachmentContentDisposition(attachment = {}, disposition = 'attachment') {
	const filename = attachmentFilename(attachment);
	const asciiFilename = filename
		.replace(/[\r\n]/g, '')
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"');

	return `${disposition}; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

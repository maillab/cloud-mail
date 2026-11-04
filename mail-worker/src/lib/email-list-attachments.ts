import type { AttachmentRow } from '../types/attachment';

/** Associate already-read rows without IO, preserving row and attachment identity. */
export function attachListAttachments<T extends { emailId: number | null; attList?: AttachmentRow[] }>(
	list: T[],
	attachments: readonly AttachmentRow[],
): void {
	for (const row of list) {
		row.attList = attachments.filter(attachment => attachment.emailId === row.emailId);
	}
}

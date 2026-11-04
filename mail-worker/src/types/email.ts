import type email from '../entity/email';
import type { SQL } from 'drizzle-orm';
import type { ScalarId } from './api';
import type { AttachmentRow, OutboundAttachment, SendAttachment } from './attachment';

export type EmailRow = typeof email.$inferSelect;
export type NewEmail = typeof email.$inferInsert;
export interface TextProjection { text?: string | null; content?: string | null; listText?: string }
type BriefFields = 'emailId' | 'sendEmail' | 'name' | 'subject' | 'code' | 'recipient' | 'toEmail' | 'type' | 'status' | 'message' | 'unread' | 'createTime' | 'isDel';
export type MailListItem = Pick<EmailRow, BriefFields> & Partial<Omit<EmailRow, BriefFields>> & {
	starId?: number | null; isStar?: number; userEmail?: string | null; attList?: AttachmentRow[]; listText?: string;
};
export type SentMail = EmailRow & { attList: AttachmentRow[] };
export interface MailPage { list: MailListItem[]; total: number; latestEmail: { emailId: number; accountId: number; userId: ScalarId } }

type NumericQuery = string | number;
export interface EmailListQuery {
	emailId?: NumericQuery; type?: NumericQuery; accountId?: NumericQuery; size?: NumericQuery;
	timeSort?: NumericQuery; allReceive?: NumericQuery; full?: NumericQuery | boolean;
}
export interface AllMailQuery {
	emailId?: NumericQuery; size?: NumericQuery; name?: string; subject?: string; accountEmail?: string; userEmail?: string;
	type?: string; timeSort?: NumericQuery; full?: NumericQuery | boolean;
}
export interface PersonalMailFilters {
	userId: ScalarId; accountId: number; type: number; allReceive: number; emailId?: number; timeSort?: number; withCursor?: boolean;
}
export interface AllMailFilters {
	emailId?: number; name?: string; subject?: string; accountEmail?: string; userEmail?: string; type?: string; timeSort?: number; withCursor?: boolean;
}
export type MailConditions = (SQL | undefined)[];
export interface MailIdsInput { emailIds: string }
export interface ReadMailInput { emailIds: ScalarId[] }
export interface SendMailInput {
	accountId: ScalarId; name?: string; sendType?: string; emailId?: ScalarId; receiveEmail: string[];
	text?: string; content: string; subject?: string; attachments?: SendAttachment[];
}
export interface ProviderMail {
	name: string; accountEmail: string; receiveEmail: string[]; subject?: string; text?: string; html: string;
	attachments: OutboundAttachment[]; sendType?: string; messageId?: string | null;
}
export interface ProviderResult { data?: { id: string } | null; error?: { message: string } | null }
export interface BodyImage { key?: string; contentId: string; type?: number | string | null }
export interface EmailStatusUpdate { status: number; resendEmailId: string | SQL; message?: string | null | SQL }
export interface BatchDeleteInput { sendName?: string; sendEmail?: string; toEmail?: string; subject?: string; startTime?: string; endTime?: string; type?: string }

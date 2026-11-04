import type { ScalarId } from './api';
/** Metadata persisted under the existing KV/R2 attachment and background object keys. */
export interface ObjectMetadata {
	contentType?: string | null;
	contentDisposition?: string;
	cacheControl?: string;
}

export type ObjectContent = string | ArrayBuffer | ArrayBufferView | ReadableStream;
export type StoredObject = Response | R2ObjectBody | null;
export type StorageType = 'KV' | 'R2' | 'S3';

export type AttachmentRow = typeof att.$inferSelect;
export type NewAttachment = typeof att.$inferInsert;

/** Before provider/storage preparation, these fields have several legacy shapes. */
export interface OutboundAttachment {
	content?: string | ArrayBuffer | Uint8Array<ArrayBuffer> | null;
	filename?: string | null;
	mimeType?: string | null;
	contentType?: string | null;
	type?: string | number;
	contentId?: string | null;
	key?: string;
	size?: number | null;
	disposition?: string | null;
	related?: string | boolean | null;
	encoding?: string | null;
	buff?: ArrayBuffer | Uint8Array<ArrayBuffer>;
	userId?: ScalarId;
	accountId?: ScalarId;
	emailId?: number;
}

export interface InlineAttachment extends OutboundAttachment {
	contentId: string;
}

export interface PreparedAttachment extends OutboundAttachment {
	key: string;
	buff: ArrayBuffer | Uint8Array<ArrayBuffer>;
}
export interface SendAttachment extends Omit<OutboundAttachment, 'content' | 'type' | 'buff'> {
	content: string;
	type?: string;
	buff?: Uint8Array<ArrayBuffer>;
}
export interface ReceiveAttachment extends Omit<NewAttachment, 'userId' | 'accountId' | 'emailId' | 'related'> {
	content: ArrayBuffer;
	mimeType: string;
	userId?: ScalarId;
	accountId?: ScalarId;
	emailId?: number;
	related?: boolean;
}
import type { att } from '../entity/att';

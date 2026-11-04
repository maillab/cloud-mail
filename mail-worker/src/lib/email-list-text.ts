import emailUtils from '../utils/email-utils';
import { EMAIL_LIST_TEXT_LEN } from './email-list-columns';
import type { TextProjection } from '../types/email';

export function toListText(item: TextProjection): string {
	const raw = emailUtils.formatText(item.text) || emailUtils.htmlToText(item.content);
	return raw.replace(/\s+/g, ' ').trim().slice(0, EMAIL_LIST_TEXT_LEN);
}

export function applyBriefListText<T extends TextProjection>(list: T[]): T[] {
	for (const item of list) {
		item.listText = toListText(item);
		delete item.text;
		delete item.content;
	}
	return list;
}

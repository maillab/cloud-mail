import { describe, expect, it } from 'vitest';
import { emailListIncludes, parseEmailList } from '../src/utils/email-list-utils';

describe('email-list-utils', () => {
	it('trims comma-separated forwarding addresses and drops blanks', () => {
		expect(parseEmailList(' first@example.com, second@example.com ,,')).toEqual([
			'first@example.com',
			'second@example.com'
		]);
	});

	it('supports full-width comma separators from copied settings', () => {
		expect(parseEmailList('first@example.com\uFF0Csecond@example.com')).toEqual([
			'first@example.com',
			'second@example.com'
		]);
	});

	it('matches rule email addresses case-insensitively', () => {
		expect(emailListIncludes('User@Example.com, other@example.com', 'user@example.com')).toBe(true);
		expect(emailListIncludes('User@Example.com, other@example.com', 'missing@example.com')).toBe(false);
	});
});

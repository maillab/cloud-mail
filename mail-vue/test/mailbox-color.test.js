import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mailboxColorIndex, senderInitial } from '../src/utils/mailbox-color.js';

test('同一地址稳定，大小写空格无关', () => {
	assert.equal(mailboxColorIndex('Admin@Example.com '), mailboxColorIndex('admin@example.com'));
});
test('范围 1..8', () => {
	for (const a of ['a@x.com','b@x.com','c@x.com','d@x.com','e@x.com','f@x.com','g@x.com','h@x.com','i@x.com']) {
		const i = mailboxColorIndex(a); assert.ok(i >= 1 && i <= 8, a);
	}
});
test('不同地址会分散', () => {
	const set = new Set(['a@x.com','b@x.com','c@x.com','d@x.com','e@x.com','f@x.com','g@x.com','h@x.com','i@x.com','j@x.com'].map(mailboxColorIndex));
	assert.ok(set.size >= 4);
});
test('空值返回 1', () => { assert.equal(mailboxColorIndex(''), 1); assert.equal(mailboxColorIndex(undefined), 1); });
test('首字', () => {
	assert.equal(senderInitial('GitHub, Inc.', 'noreply@github.com'), 'G');
	assert.equal(senderInitial('  麻梨菜 島村', 'x@y'), '麻');
	assert.equal(senderInitial('', 'noreply@github.com'), 'N');
	assert.equal(senderInitial(undefined, ''), '?');
});

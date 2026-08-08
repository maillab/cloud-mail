import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeEmailCursor, normalizeEmailLatestQuery, normalizeEmailListQuery } from '../src/utils/email-query-utils.js';

const newest = Number.MAX_SAFE_INTEGER;

assert.deepEqual(
  normalizeEmailListQuery({ accountId: '7', allReceive: '0', emailId: '0', timeSort: '0', size: '50', type: '0' }),
  { accountId: 7, size: 50, timeSort: 0, type: 0, emailId: newest, allReceive: 0 }
);
assert.equal(normalizeEmailListQuery({ accountId: '7', timeSort: '0', type: '1' }).emailId, newest);
assert.equal(normalizeEmailListQuery({ accountId: '7', emailId: '42', timeSort: '0', type: '1' }).emailId, 42);
assert.equal(normalizeEmailListQuery({ accountId: '7', emailId: '0', timeSort: '1', type: '0' }).emailId, 0);
assert.equal(normalizeEmailListQuery({ accountId: '0', allReceive: '1', emailId: '0', timeSort: '0', type: '0' }).accountId, 0);
assert.throws(
  () => normalizeEmailListQuery({ accountId: '0', allReceive: '0', timeSort: '0', type: '0' }),
  /allReceive/
);
assert.deepEqual(
  normalizeEmailLatestQuery({ accountId: '0', allReceive: '1', emailId: '9' }),
  { accountId: 0, emailId: 9, allReceive: 1 }
);


// /all-mail and /starred both use zero as the first descending-page sentinel.
assert.equal(normalizeEmailCursor('0', { timeSort: 0 }), newest);
assert.equal(normalizeEmailCursor(undefined, { timeSort: 0 }), newest);
assert.equal(normalizeEmailCursor('55', { timeSort: 0 }), 55);
assert.equal(normalizeEmailCursor('0', { timeSort: 1 }), 0);
assert.throws(() => normalizeEmailCursor('-1', { timeSort: 0 }), /emailId/);


// Regression guard for /allEmail/list: emailService.allList() calls toPageSize().
// A missing import is syntactically valid JavaScript but crashes only at runtime in Workers.
const emailServiceSource = readFileSync(new URL('../src/service/email-service.js', import.meta.url), 'utf8');
const inputUtilsImport = emailServiceSource.match(/import\s*\{([^}]*)\}\s*from\s*['"]\.\.\/utils\/input-utils['"]/s);
assert.ok(inputUtilsImport, 'email-service.js must import input-utils');
assert.match(inputUtilsImport[1], /\btoPageSize\b/, 'email-service.js must import toPageSize for /allEmail/list');

console.log('Email list contract tests passed.');

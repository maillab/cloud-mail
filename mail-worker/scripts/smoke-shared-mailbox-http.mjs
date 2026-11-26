// HTTP smoke test: logs in as admin against the running dev worker (port 8787)
// and exercises the new shared-mailbox admin endpoints end-to-end through the
// real auth + permission middleware. Complements the SQL-level smoke test.
//
// Run: node scripts/smoke-shared-mailbox-http.mjs
// Requires the dev worker to be running on 127.0.0.1:8787.

import { createHash, randomBytes } from 'node:crypto';

const API = 'http://127.0.0.1:8787/api';
const ADMIN = 'admin@example.com';

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? ' :: ' + detail : ''}`); }
}
function section(t) { console.log(`\n== ${t} ==`); }

async function call(method, path, { token, body } = {}) {
  const headers = { 'accept-language': 'en' };
  if (token) headers.Authorization = token;
  const opts = { method, headers };
  if (body !== undefined) { headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(API + path, opts);
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

// --- login -----------------------------------------------------------------
section('Login as admin');
// The local seed sets a random password we do not have. Instead, reset it
// directly in the DB is not possible over HTTP without the old password.
// We try a password reset via the reset endpoint is also gated. So this HTTP
// test expects a known password; if login fails we skip HTTP checks.
const password = process.env.SMOKE_ADMIN_PASSWORD || '';
if (!password) {
  console.log('  SKIP  no SMOKE_ADMIN_PASSWORD env var; cannot log in over HTTP.');
  console.log('  (The SQL-level smoke test already validated the query logic.)');
  console.log(`\n  ${passed} passed, ${failed} failed (HTTP portion skipped)`);
  process.exit(0);
}

const login = await call('POST', '/login/password', { body: { email: ADMIN, password } });
check('login returns 200', login.status === 200, `status=${login.status} ${JSON.stringify(login.json)}`);
const token = login.json?.data?.token || login.json?.token;
check('login returns token', !!token, JSON.stringify(login.json));

if (token) {
  // --- admin list ---
  section('GET /shared-mailbox/admin/list');
  const list = await call('GET', '/shared-mailbox/admin/list', { token });
  check('admin list 200', list.status === 200, `status=${list.status}`);
  check('admin list body code 200', list.json?.code === 200, JSON.stringify(list.json));
  check('admin list returns array', Array.isArray(list.json?.data), typeof list.json?.data);
  const boxes = list.json?.data || [];
  console.log(`  shared mailboxes: ${boxes.length}`);
  for (const b of boxes) console.log(`    - ${b.email} (${b.mailbox_status}) members=${b.member_count}`);

  // --- members of first mailbox ---
  if (boxes.length) {
    const mbId = boxes[0].account_id;
    section(`GET /shared-mailbox/members (mailboxId=${mbId})`);
    const mem = await call('GET', `/shared-mailbox/members?mailboxId=${mbId}`, { token });
    check('members 200', mem.status === 200, `status=${mem.status}`);
    check('members body code 200', mem.json?.code === 200, JSON.stringify(mem.json));
    check('members returns array', Array.isArray(mem.json?.data), typeof mem.json?.data);
    console.log(`  members: ${(mem.json?.data || []).length}`);
  }

  // --- create + update + delete a temp shared mailbox ---
  section('POST /account/sharedMailbox (create)');
  const email = `smoke-http-${Date.now()}@example.com`;
  const create = await call('POST', '/account/sharedMailbox', { token, body: { email, displayName: 'HTTP Smoke' } });
  check('create returns 200', create.status === 200, `status=${create.status} ${JSON.stringify(create.json)}`);
  check('create body code 200', create.json?.code === 200, JSON.stringify(create.json));
  const created = create.json?.data;
  check('create returns accountId', !!created?.accountId, JSON.stringify(created));
  if (created?.accountId) {
    section('PUT /account/sharedMailbox (rename + disable)');
    const upd = await call('PUT', '/account/sharedMailbox', { token, body: { accountId: created.accountId, displayName: 'Renamed HTTP', mailboxStatus: 'disabled' } });
    check('update 200', upd.status === 200, `status=${upd.status} ${JSON.stringify(upd.json)}`);
    check('update code 200', upd.json?.code === 200, JSON.stringify(upd.json));

    // cleanup: delete the temp mailbox
    section('DELETE /account/delete (cleanup)');
    const del = await call('DELETE', `/account/delete?accountId=${created.accountId}`, { token });
    check('delete 200', del.status === 200, `status=${del.status} ${JSON.stringify(del.json)}`);
  }
}

section('Result');
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
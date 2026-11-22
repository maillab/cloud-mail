// Live HTTP smoke test for projects, calendar, notes endpoints.
// Logs in as a test user and hits each module's list endpoint.
import { createHash, randomBytes } from 'node:crypto';

const API = 'http://127.0.0.1:8787/api';
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

// login as user2 (no MFA)
section('Login');
const login = await call('POST', '/login', { body: { email: 'user2@example.com', password: 'SmokeTest123!' } });
check('login 200', login.status === 200, `status=${login.status}`);
const token = login.json?.data?.token;
check('token present', !!token);

if (!token) { console.log('Cannot proceed without token'); process.exit(1); }

// Projects
section('GET /projects');
const proj = await call('GET', '/projects', { token });
check('projects 200', proj.status === 200, `status=${proj.status}`);
check('projects code 200', proj.json?.code === 200, JSON.stringify(proj.json));
check('projects returns list', Array.isArray(proj.json?.data?.list) || Array.isArray(proj.json?.data), typeof proj.json?.data);
console.log(`  projects: ${JSON.stringify(proj.json?.data).substring(0, 120)}`);

// Calendar
section('GET /calendar');
const cal = await call('GET', '/calendar', { token });
check('calendar 200', cal.status === 200, `status=${cal.status}`);
check('calendar code 200', cal.json?.code === 200, JSON.stringify(cal.json));
check('calendar returns data', !!cal.json?.data);
console.log(`  calendar keys: ${Object.keys(cal.json?.data || {}).join(', ')}`);

// Notes
section('GET /notes');
const notes = await call('GET', '/notes', { token });
check('notes 200', notes.status === 200, `status=${notes.status}`);
check('notes code 200', notes.json?.code === 200, JSON.stringify(notes.json));
check('notes returns data', !!notes.json?.data);
console.log(`  notes keys: ${Object.keys(notes.json?.data || {}).join(', ')}`);

// Notes with filters
section('GET /notes?pinned=true');
const pinned = await call('GET', '/notes?pinned=true', { token });
check('pinned notes 200', pinned.status === 200, `status=${pinned.status}`);

// Calendar upcoming
section('GET /calendar?view=upcoming');
const upcoming = await call('GET', '/calendar?view=upcoming', { token });
check('upcoming 200', upcoming.status === 200, `status=${upcoming.status}`);

section('Result');
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
// Set or restore the admin password in the live dev D1 so the HTTP smoke test
// can log in. Usage:
//   node scripts/smoke-set-admin-pw.mjs set <password>
//   node scripts/smoke-set-admin-pw.mjs restore <salt> <hash>
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';

const d1Path = process.env.D1_SQLITE_PATH
  || path.join(process.env.TEMP || tmpdir(), 'kilo', 'persist-T', 'v3', 'd1', 'miniflare-D1DatabaseObject', 'a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite');

const [, , cmd, ...rest] = process.argv;
const db = new DatabaseSync(d1Path);
const admin = db.prepare('SELECT user_id, password, salt FROM user WHERE email = ?').get('admin@example.com');
if (!admin) { console.error('admin not found'); process.exit(1); }

if (cmd === 'set') {
  const password = rest[0];
  const salt = randomBytes(16).toString('base64');
  const hash = createHash('sha256').update(salt + password).digest('base64');
  // preserve original for restore
  console.log(`ORIG_SALT=${admin.salt}`);
  console.log(`ORIG_HASH=${admin.password}`);
  db.prepare('UPDATE user SET salt = ?, password = ? WHERE user_id = ?').run(salt, hash, admin.user_id);
  console.log(`SET password for admin (user_id=${admin.user_id})`);
} else if (cmd === 'restore') {
  const [salt, hash] = rest;
  db.prepare('UPDATE user SET salt = ?, password = ? WHERE user_id = ?').run(salt, hash, admin.user_id);
  console.log('RESTORED original admin password');
} else {
  console.log('usage: set <password> | restore <salt> <hash>');
}
db.close();
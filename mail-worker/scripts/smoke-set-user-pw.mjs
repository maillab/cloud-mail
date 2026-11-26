// Set/reset a known password for a specific user in the live dev D1.
// Usage: node scripts/smoke-set-user-pw.mjs <email> set <password>
//      node scripts/smoke-set-user-pw.mjs <email> restore <salt> <hash>
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';

const d1Path = process.env.D1_SQLITE_PATH
  || path.join(process.env.TEMP || tmpdir(), 'kilo', 'persist-T', 'v3', 'd1', 'miniflare-D1DatabaseObject', 'a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite');

const [, , email, cmd, ...rest] = process.argv;
const db = new DatabaseSync(d1Path);
const u = db.prepare('SELECT user_id, password, salt FROM user WHERE email = ?').get(email);
if (!u) { console.error('user not found: ' + email); process.exit(1); }

if (cmd === 'set') {
  const password = rest[0];
  const salt = randomBytes(16).toString('base64');
  const hash = createHash('sha256').update(salt + password).digest('base64');
  console.log(`ORIG_SALT=${u.salt}`);
  console.log(`ORIG_HASH=${u.password}`);
  db.prepare('UPDATE user SET salt = ?, password = ? WHERE user_id = ?').run(salt, hash, u.user_id);
  console.log(`SET password for ${email}`);
} else if (cmd === 'restore') {
  const [salt, hash] = rest;
  db.prepare('UPDATE user SET salt = ?, password = ? WHERE user_id = ?').run(salt, hash, u.user_id);
  console.log('RESTORED');
}
db.close();
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const workerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const persistDir = path.join(workerDir, '.wrangler', 'local');
const seedPath = path.join(workerDir, '.wrangler', 'local-seed.sql');
const varsPath = path.join(workerDir, '.dev.vars');
const apiUrl = 'http://127.0.0.1:8787/api';

function sqlString(value) {
	return `'${value.replaceAll("'", "''")}'`;
}

let vars;
try {
	vars = await readFile(varsPath, 'utf8');
} catch (error) {
	if (error.code === 'ENOENT') {
		throw new Error('Run "pnpm --dir mail-worker setup:local" before starting the Worker.');
	}
	throw error;
}

const secret = vars.match(/^jwt_secret\s*=\s*(.*?)\s*$/m)?.[1]?.replace(/^["']|["']$/g, '');
if (!secret) {
	throw new Error('mail-worker/.dev.vars must contain a jwt_secret. Run setup:local to generate one.');
}

const initResponse = await fetch(`${apiUrl}/init/${encodeURIComponent(secret)}`);
const initText = await initResponse.text();
if (!initResponse.ok || initText.trim() !== 'success') {
	throw new Error(`Local database initialization failed (${initResponse.status}): ${initText}`);
}

const email = 'admin@example.com';
const password = randomBytes(18).toString('base64url');
const salt = randomBytes(16).toString('base64');
const passwordHash = createHash('sha256').update(salt + password).digest('base64');

const statements = [
	`UPDATE setting SET
		register = 1, receive = 1, send = 0, resend_tokens = '{}',
		forward_status = 1, forward_email = '',
		tg_bot_status = 1, tg_bot_token = '',
		webhook_status = 1, webhook_url = '',
		bucket = '', endpoint = '', s3_access_key = '', s3_secret_key = '';`,
	`DELETE FROM email_folder WHERE user_id IN (SELECT user_id FROM user WHERE email = ${sqlString(email)});`,
	`DELETE FROM mail_folder WHERE user_id IN (SELECT user_id FROM user WHERE email = ${sqlString(email)});`,
	`DELETE FROM email_template WHERE user_id IN (SELECT user_id FROM user WHERE email = ${sqlString(email)});`,
	`DELETE FROM star WHERE user_id IN (SELECT user_id FROM user WHERE email = ${sqlString(email)});`,
	`DELETE FROM attachments WHERE user_id IN (SELECT user_id FROM user WHERE email = ${sqlString(email)});`,
	`DELETE FROM email WHERE user_id IN (SELECT user_id FROM user WHERE email = ${sqlString(email)});`,
	`UPDATE user SET type = 1, password = ${sqlString(passwordHash)}, salt = ${sqlString(salt)},
		status = 0, is_del = 0 WHERE email = ${sqlString(email)};`,
	`INSERT INTO user (email, type, password, salt, status, is_del)
		SELECT ${sqlString(email)}, 1, ${sqlString(passwordHash)}, ${sqlString(salt)}, 0, 0
		WHERE NOT EXISTS (SELECT 1 FROM user WHERE email = ${sqlString(email)});`,
	`UPDATE account SET status = 0, is_del = 0 WHERE email = ${sqlString(email)};`,
	`INSERT INTO account (email, status, user_id, is_del)
		SELECT ${sqlString(email)}, 0, user_id, 0 FROM user
		WHERE email = ${sqlString(email)}
			AND NOT EXISTS (SELECT 1 FROM account WHERE email = ${sqlString(email)});`,
	`INSERT INTO email (
		send_email, name, sender_email, account_id, user_id, subject, content, text,
		recipient, to_email, to_name, cc, bcc, type, status, unread, mailbox_folder,
		category, category_override, is_del
	)
	SELECT
		'preview@example.net', 'XPass Preview', 'preview@example.net', account_id, user_id,
		'Your local inbox is ready',
		'<p>This is a local-only preview message. No email was sent or received.</p>',
		'This is a local-only preview message. No email was sent or received.',
		'[{"address":"admin@example.com","name":"Admin"}]', 'admin@example.com', 'Admin',
		'[]', '[]', 0, 0, 0, 'inbox', 'primary', 0, 0
	FROM account WHERE email = ${sqlString(email)};`,
];

await mkdir(path.dirname(seedPath), { recursive: true });
await writeFile(seedPath, `${statements.join('\n')}\n`, { mode: 0o600 });

try {
	const wranglerArgs = [
		'exec', 'wrangler', 'd1', 'execute', 'xpass-local',
		'--local', '--config', 'wrangler-dev.toml',
		'--persist-to', path.relative(workerDir, persistDir),
		'--file', path.relative(workerDir, seedPath),
	];
	const isWindows = process.platform === 'win32';
	const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'pnpm';
	const args = isWindows
		? ['/d', '/s', '/c', `pnpm.cmd ${wranglerArgs.join(' ')}`]
		: wranglerArgs;
	const result = spawnSync(command, args, {
		cwd: workerDir,
		stdio: 'inherit',
		windowsHide: true,
	});

	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`Local D1 seed exited with status ${result.status}.`);
	}
} finally {
	await rm(seedPath, { force: true });
}

console.log(`Local database initialized. Test login: ${email}`);
console.log(`Temporary password (printed once; do not commit): ${password}`);

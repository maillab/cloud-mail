import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import service from '../.wrangler/claim-service.mjs';

function fixture() {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec(`
		CREATE TABLE user (user_id INTEGER PRIMARY KEY, email TEXT, is_del INTEGER, status INTEGER);
		CREATE TABLE account (account_id INTEGER PRIMARY KEY, user_id INTEGER, email TEXT, is_del INTEGER);
		CREATE TABLE email (email_id INTEGER PRIMARY KEY, user_id INTEGER, account_id INTEGER,
			status INTEGER, type INTEGER, is_del INTEGER, to_email TEXT, content TEXT, unread INTEGER);
		CREATE TABLE attachments (att_id INTEGER PRIMARY KEY, email_id INTEGER,
			user_id INTEGER, account_id INTEGER, key TEXT);
		INSERT INTO user VALUES (1, 'admin@example.test', 0, 0), (2, 'user@example.test', 0, 0);
		INSERT INTO account VALUES (20, 2, 'target@example.test', 0), (21, 1, 'other@example.test', 0);
		INSERT INTO email VALUES (10, 0, 0, 7, 0, 0, 'TARGET@example.test', '<p>original</p>', 0);
		INSERT INTO attachments VALUES (30, 10, 0, 0, 'attachments/a'), (31, 10, 0, 0, 'attachments/inline');
	`);
	const db = {
		beforeBatch: null,
		failAttachments: false,
		prepare(sql) {
			const statement = {
				sql, params: [],
				bind(...params) { this.params = params; return this; },
				async first() { return sqlite.prepare(sql).get(...this.params) ?? null; },
				async all() { return { results: sqlite.prepare(sql).all(...this.params) }; }
			};
			return statement;
		},
		async batch(statements) {
			// 用真实 SQLite 事务验证回滚和生产 SQL 里的校验条件
			this.beforeBatch?.();
			sqlite.exec('BEGIN');
			try {
				const results = statements.map((statement, index) => {
					if (index === 1 && this.failAttachments) throw new Error('attachment failure');
					return { results: sqlite.prepare(statement.sql).all(...statement.params).map(row => ({ ...row })) };
				});
				sqlite.exec('COMMIT');
				return results;
			} catch (error) {
				sqlite.exec('ROLLBACK');
				throw error;
			}
		}
	};
	const c = { env: { db, admin: 'admin@example.test' }, get: () => ({ email: 'admin@example.test' }) };
	return { c, db, sqlite };
}

test('matching active mailbox receives mail and both attachments without changing content', async () => {
	const { c, sqlite } = fixture();
	const targets = await service.accounts(c, { emailId: '10' });
	assert.equal(targets.toEmail, 'TARGET@example.test');
	assert.equal(targets.accounts.length, 1);
	assert.equal(targets.accounts[0].accountId, 20);
	assert.deepEqual(await service.claim(c, { emailId: 10, accountId: 20 }),
		{ emailId: 10, userId: 2, accountId: 20, status: 0 });
	assert.deepEqual({ ...sqlite.prepare('SELECT user_id,account_id,status,content,unread FROM email').get() },
		{ user_id: 2, account_id: 20, status: 0, content: '<p>original</p>', unread: 0 });
	assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM attachments WHERE user_id=2 AND account_id=20').get().count, 2);
	assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM email').get().count, 1);
	await assert.rejects(service.claim(c, { emailId: 10, accountId: 20 }), { code: 409 });
});

test('delegated all-mail access cannot assign or enumerate targets', async () => {
	const { c, sqlite } = fixture();
	c.get = () => ({ email: 'user@example.test', permKeys: ['*', 'all-email:query'] });
	await assert.rejects(service.accounts(c, { emailId: 10 }), { code: 403 });
	await assert.rejects(service.claim(c, { emailId: 10, accountId: 20 }), { code: 403 });
	assert.equal(sqlite.prepare('SELECT user_id FROM email').get().user_id, 0);
});

test('wrong recipient, deleted mailbox, and banned or deleted owners are rejected', async () => {
	for (const mutation of [
		"UPDATE account SET email='wrong@example.test' WHERE account_id=20",
		'UPDATE account SET is_del=1 WHERE account_id=20',
		'UPDATE user SET status=1 WHERE user_id=2',
		'UPDATE user SET is_del=1 WHERE user_id=2'
	]) {
		const { c, sqlite } = fixture();
		sqlite.exec(mutation);
		assert.equal((await service.accounts(c, { emailId: 10 })).accounts.length, 0);
		await assert.rejects(service.claim(c, { emailId: 10, accountId: 20 }), { code: 409 });
		assert.equal(sqlite.prepare('SELECT account_id FROM email').get().account_id, 0);
	}
});

test('deleted, sent, partially assigned, and already assigned messages cannot be claimed', async () => {
	for (const mutation of [
		'UPDATE email SET is_del=1', 'UPDATE email SET type=1',
		'UPDATE email SET user_id=2', 'UPDATE email SET account_id=20', 'UPDATE email SET status=0'
	]) {
		const { c, sqlite } = fixture();
		sqlite.exec(mutation);
		await assert.rejects(service.claim(c, { emailId: 10, accountId: 20 }), { code: 409 });
	}
});

test('attachment failure rolls back the message update', async () => {
	const { c, db, sqlite } = fixture();
	db.failAttachments = true;
	await assert.rejects(service.claim(c, { emailId: 10, accountId: 20 }), /attachment failure/);
	assert.equal(sqlite.prepare('SELECT user_id FROM email').get().user_id, 0);
	assert.equal(sqlite.prepare('SELECT SUM(user_id) AS total FROM attachments').get().total, 0);
});

test('mail claimed concurrently to another mailbox does not transfer attachments', async () => {
	const { c, db, sqlite } = fixture();
	db.beforeBatch = () => sqlite.exec('UPDATE email SET user_id=1,account_id=21,status=0');
	await assert.rejects(service.claim(c, { emailId: 10, accountId: 20 }), { code: 409 });
	assert.equal(sqlite.prepare('SELECT account_id FROM email').get().account_id, 21);
	assert.equal(sqlite.prepare('SELECT SUM(account_id) AS total FROM attachments').get().total, 0);
});

test('target deletion between lookup and update prevents ownership changes', async () => {
	const { c, db, sqlite } = fixture();
	db.beforeBatch = () => sqlite.exec('UPDATE account SET is_del=1 WHERE account_id=20');
	await assert.rejects(service.claim(c, { emailId: 10, accountId: 20 }), { code: 409 });
	assert.equal(sqlite.prepare('SELECT user_id FROM email').get().user_id, 0);
	assert.equal(sqlite.prepare('SELECT SUM(account_id) AS total FROM attachments').get().total, 0);
});

test('partially assigned ownership changing before the write cannot be overwritten', async () => {
	const { c, db, sqlite } = fixture();
	db.beforeBatch = () => sqlite.exec('UPDATE email SET user_id=1');
	await assert.rejects(service.claim(c, { emailId: 10, accountId: 20 }), { code: 409 });
	assert.equal(sqlite.prepare('SELECT user_id FROM email').get().user_id, 1);
	assert.equal(sqlite.prepare('SELECT SUM(account_id) AS total FROM attachments').get().total, 0);
});

test('envelope recipient is rechecked inside the transaction', async () => {
	const { c, db, sqlite } = fixture();
	db.beforeBatch = () => sqlite.exec("UPDATE email SET to_email='other@example.test'");
	await assert.rejects(service.claim(c, { emailId: 10, accountId: 20 }), { code: 409 });
	assert.equal(sqlite.prepare('SELECT user_id FROM email').get().user_id, 0);
});

test('invalid identifiers are rejected before SQL writes', async () => {
	for (const emailId of [null, undefined, 0, -1, '1 OR 1=1', [10], true, Number.MAX_SAFE_INTEGER + 1]) {
		const { c } = fixture();
		await assert.rejects(service.claim(c, { emailId, accountId: 20 }), { code: 400 });
	}
});

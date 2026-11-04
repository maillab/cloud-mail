import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkerHarness, seedMail, seedUser } from '../helpers/worker-harness.mjs';

test('hourly scheduled dispatch completes SAVING statuses and clears unbound OAuth identities', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close());
	const owner = await seedUser(h);
	const owned = await seedMail(h, owner, { status: 6, is_del: 1 });
	const noone = await seedMail(h, { userId: 0, accountId: 0, email: 'nobody@example.test' }, { status: 6, is_del: 1 });
	await h.db.prepare('INSERT INTO oauth(oauth_user_id,platform,user_id) VALUES (?,?,?)').bind('pending', 'google', 0).run();
	await h.db.prepare('INSERT INTO oauth(oauth_user_id,platform,user_id) VALUES (?,?,?)').bind('bound', 'google', owner.userId).run();
	assert.equal((await h.scheduled()).outcome, 'ok');
	assert.equal((await h.db.prepare('SELECT status FROM email WHERE email_id=?').bind(owned.email_id).first()).status, 0);
	assert.equal((await h.db.prepare('SELECT status FROM email WHERE email_id=?').bind(noone.email_id).first()).status, 7);
	assert.deepEqual((await h.db.prepare('SELECT oauth_user_id FROM oauth ORDER BY oauth_id').all()).results, [{ oauth_user_id: 'bound' }]);
	// Existing recovery leaves is_del=1. It is a known defect, not a desired visibility contract.
	t.diagnostic(`Recovered hidden flag (known baseline debt): ${(await h.db.prepare('SELECT is_del FROM email WHERE email_id=?').bind(owned.email_id).first()).is_del}`);
});

test('30-minute scheduled branch refreshes optional analysis only and leaves recovery/OAuth rows alone', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close()); const owner = await seedUser(h);
	const saving = await seedMail(h, owner, { status: 6 });
	await h.db.prepare('INSERT INTO oauth(oauth_user_id,platform,user_id) VALUES (?,?,?)').bind('pending', 'google', 0).run();
	assert.equal((await h.scheduled('*/30 * * * *')).outcome, 'ok');
	assert.equal((await h.db.prepare('SELECT status FROM email WHERE email_id=?').bind(saving.email_id).first()).status, 6);
	assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM oauth').first()).n, 1);
});

test('hourly auto-clean preserves excluded-user data and recent mail while deleting old unprotected mail', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close());
	const owner = await seedUser(h); const excluded = await seedUser(h, 'excluded@example.test');
	await h.settings({ autoCleanDays: 1, autoCleanExclude: excluded.email.toUpperCase() });
	const old = await seedMail(h, owner, { create_time: '2000-01-01 00:00:00' });
	const recent = await seedMail(h, owner, { create_time: '9999-01-01 00:00:00' });
	const protectedRow = await seedMail(h, excluded, { create_time: '2000-01-01 00:00:00' });
	assert.equal((await h.scheduled()).outcome, 'ok');
	assert.equal(await h.db.prepare('SELECT email_id FROM email WHERE email_id=?').bind(old.email_id).first(), null);
	assert.ok(await h.db.prepare('SELECT email_id FROM email WHERE email_id=?').bind(recent.email_id).first());
	assert.ok(await h.db.prepare('SELECT email_id FROM email WHERE email_id=?').bind(protectedRow.email_id).first());
});

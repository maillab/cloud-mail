import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/service/setting-service', () => ({ default: {} }));
vi.mock('../../src/service/verify-record-service', () => ({ default: {} }));
vi.mock('../../src/i18n/i18n', () => ({ t: key => key }));

import { dbInit } from '../../src/init/init';

describe('Mailjet database migration', () => {
	it('upgrades existing settings with empty credentials and preserves Resend configuration', async () => {
		const db = new DatabaseSync(':memory:');
		try {
			db.exec(`CREATE TABLE setting (resend_tokens TEXT NOT NULL DEFAULT '{}');
				INSERT INTO setting (resend_tokens) VALUES ('{"example.com":"resend-key"}');`);
			const c = { env: { db: { prepare: sql => ({
				all: async () => ({ results: db.prepare(sql).all() }),
				run: async () => db.prepare(sql).run()
			}) } } };
			await dbInit.mailjetDB(c);
			const row = db.prepare('SELECT * FROM setting').get();
			expect(JSON.parse(row.mailjet_tokens)).toEqual({});
			expect(JSON.parse(row.resend_tokens)).toEqual({ 'example.com': 'resend-key' });
			const credentials = JSON.stringify({ 'example.com': { apiKey: 'key', secretKey: 'secret' } });
			db.prepare('UPDATE setting SET mailjet_tokens = ?').run(credentials);
			await dbInit.mailjetDB(c);
			expect(db.prepare('SELECT mailjet_tokens FROM setting').get().mailjet_tokens).toBe(credentials);
		} finally {
			db.close();
		}
	});

	it('reports migration failures so initialization cannot appear successful', async () => {
		const c = { env: { db: { prepare: () => ({ all: async () => { throw new Error('Database unavailable'); } }) } } };
		await expect(dbInit.mailjetDB(c)).rejects.toThrow('Database unavailable');
	});
});

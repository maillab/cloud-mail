import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCommit, writeBuildInfo } from '../../scripts/write-build-info.mjs';

describe('deployed build identification', () => {
	it('uses the Cloudflare commit ahead of unrelated GitHub environment values', () => {
		expect(buildCommit({ WORKERS_CI_COMMIT_SHA: 'a'.repeat(40), GITHUB_SHA: 'b'.repeat(40) })).toBe('a'.repeat(40));
	});

	it('supports GitHub build commit identifiers', () => {
		expect(buildCommit({ GITHUB_SHA: 'b'.repeat(40) })).toBe('b'.repeat(40));
	});

	it('rejects invalid CI commit identifiers', () => {
		expect(() => buildCommit({ WORKERS_CI_COMMIT_SHA: 'not-a-commit' })).toThrow('full Git commit SHA');
	});

	it('writes only the public commit identifier after a frontend build exists', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'cloud-mail-build-info-'));
		try {
			await writeFile(join(directory, 'index.html'), '<html></html>');
			await writeBuildInfo({ WORKERS_CI_COMMIT_SHA: 'a'.repeat(40), JWT_SECRET: 'private-value' }, directory);
			const result = await readFile(join(directory, 'deployment.json'), 'utf8');
			expect(JSON.parse(result)).toEqual({ commit: 'a'.repeat(40) });
			expect(result).not.toContain('private-value');
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('cannot publish a version marker without a built frontend', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'cloud-mail-build-info-'));
		try {
			await expect(writeBuildInfo({ GITHUB_SHA: 'a'.repeat(40) }, directory)).rejects.toThrow();
			await expect(readFile(join(directory, 'deployment.json'))).rejects.toThrow();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});

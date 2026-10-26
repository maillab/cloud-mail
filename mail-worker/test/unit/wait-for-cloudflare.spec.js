import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForCloudflare } from '../../scripts/wait-for-cloudflare.mjs';

const env = { GITHUB_REPOSITORY: 'owner/cloud-mail', GITHUB_SHA: 'a'.repeat(40), GH_TOKEN: 'github-token', NAME: 'cloud-mail' };
const check = {
	id: 10, name: 'Workers Builds: cloud-mail', head_sha: env.GITHUB_SHA,
	app: { slug: 'cloudflare-workers-and-pages' }, status: 'completed', conclusion: 'success'
};
const response = check_runs => Response.json({ check_runs });

beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));

describe('wait for the deployed commit', () => {
	it('waits through a missing and then running build before succeeding', async () => {
		const fetchImpl = vi.fn()
			.mockResolvedValueOnce(response([]))
			.mockResolvedValueOnce(response([{ ...check, status: 'in_progress', conclusion: null }]))
			.mockResolvedValueOnce(response([check]));
		const sleep = vi.fn();
		await waitForCloudflare(env, { fetchImpl, sleep });
		expect(fetchImpl).toHaveBeenCalledTimes(3);
		expect(sleep).toHaveBeenCalledTimes(2);
		expect(fetchImpl.mock.calls[0][0]).toContain(`/commits/${env.GITHUB_SHA}/check-runs`);
		expect(fetchImpl.mock.calls.every(([url]) => url.startsWith('https://api.github.com/'))).toBe(true);
	});

	it.each(['failure', 'cancelled', 'timed_out', 'skipped', 'neutral'])('stops for deployment conclusion %s', async conclusion => {
		const fetchImpl = vi.fn().mockResolvedValue(response([{ ...check, conclusion }]));
		await expect(waitForCloudflare(env, { fetchImpl })).rejects.toThrow('initialization stopped');
		expect(fetchImpl).toHaveBeenCalledOnce();
	});

	it.each([
		{ ...check, head_sha: 'b'.repeat(40) },
		{ ...check, name: 'Workers Builds: another-worker' },
		{ ...check, app: { slug: 'github-actions' } }
	])('ignores successful checks from another commit, Worker, or application', async other => {
		await expect(waitForCloudflare(env, {
			fetchImpl: vi.fn().mockImplementation(async () => response([other])), sleep: vi.fn(), maxAttempts: 2
		})).rejects.toThrow('Timed out');
	});

	it('uses the newest build result when a commit has been rebuilt', async () => {
		await expect(waitForCloudflare(env, {
			fetchImpl: vi.fn().mockResolvedValue(response([check, { ...check, id: 11, conclusion: 'failure' }]))
		})).rejects.toThrow('failure');
	});

	it('requires GitHub checks read permission', async () => {
		await expect(waitForCloudflare(env, {
			fetchImpl: vi.fn().mockResolvedValue(Response.json({ message: 'Forbidden' }, { status: 403 }))
		})).rejects.toThrow('HTTP 403');
	});

	it('rejects malformed API results', async () => {
		await expect(waitForCloudflare(env, {
			fetchImpl: vi.fn().mockResolvedValue(Response.json({}))
		})).rejects.toThrow('Cannot read GitHub build checks');
	});

	it('validates GitHub context before making a request', async () => {
		const fetchImpl = vi.fn();
		await expect(waitForCloudflare({ ...env, GITHUB_SHA: '' }, { fetchImpl })).rejects.toThrow('workflow token');
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});

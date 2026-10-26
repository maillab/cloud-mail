import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applicationUrl, initializeApp, waitForApplication } from '../../scripts/initialize-app.mjs';

const env = { DOMAIN: 'firemail.pp.ua', JWT_SECRET: 'test-secret' };

beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));

describe('application initialization without Cloudflare credentials', () => {
	it.each(['firemail.pp.ua', 'https://firemail.pp.ua', 'https://firemail.pp.ua/'])('accepts application address %s', DOMAIN => {
		expect(applicationUrl({ DOMAIN })).toBe('https://firemail.pp.ua');
	});

	it('supports legacy domain arrays and a separate application URL', () => {
		expect(applicationUrl({ DOMAIN: '["firemail.pp.ua","example.com"]' })).toBe('https://firemail.pp.ua');
		expect(applicationUrl({ DOMAIN: 'example.com', APP_URL: 'https://firemail.pp.ua' })).toBe('https://firemail.pp.ua');
	});

	it.each(['', '[]', '[broken', 'http://example.com', 'https://user:pass@example.com', 'example.com/path', 'example.com?x=y'])('rejects invalid application address %s', DOMAIN => {
		expect(() => applicationUrl({ DOMAIN })).toThrow();
	});

	it('calls only the deployed application with an encoded initialization secret', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(new Response('success'));
		await initializeApp({ ...env, JWT_SECRET: 'secret?with/#characters' }, { fetchImpl });
		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(fetchImpl.mock.calls[0][0]).toBe('https://firemail.pp.ua/api/init/secret%3Fwith%2F%23characters');
		expect(fetchImpl.mock.calls[0][1].redirect).toBe('manual');
	});

	it.each(['', 'bad\nsecret'])('rejects an empty or multiline secret', async JWT_SECRET => {
		const fetchImpl = vi.fn();
		await expect(initializeApp({ ...env, JWT_SECRET }, { fetchImpl })).rejects.toThrow('JWT_SECRET');
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('fails immediately for the wrong secret', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(new Response('❌ JWT secret mismatch'));
		await expect(initializeApp(env, { fetchImpl })).rejects.toThrow('does not match');
		expect(fetchImpl).toHaveBeenCalledOnce();
	});

	it('does not accept a login page or a JSON application error as success', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(new Response('{"code":502,"message":"KV not bound"}'));
		await expect(initializeApp(env, { fetchImpl })).rejects.toThrow('did not return success');
	});

	it('retries a temporary network or server failure', async () => {
		const fetchImpl = vi.fn()
			.mockRejectedValueOnce(new Error('Temporary network failure'))
			.mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
			.mockResolvedValueOnce(new Response('success'));
		const sleep = vi.fn();
		await initializeApp(env, { fetchImpl, sleep });
		expect(fetchImpl).toHaveBeenCalledTimes(3);
		expect(sleep).toHaveBeenCalledTimes(2);
	});

	it('limits retries for an unreachable application', async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new Error('Network failure'));
		await expect(initializeApp(env, { fetchImpl, sleep: vi.fn() })).rejects.toThrow('Cannot reach');
		expect(fetchImpl).toHaveBeenCalledTimes(5);
	});

	it('does not print response bodies containing private configuration', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(new Response('private-value'));
		await expect(initializeApp(env, { fetchImpl })).rejects.toThrow();
		expect(JSON.stringify(console.log.mock.calls)).not.toContain('private-value');
		expect(JSON.stringify(console.log.mock.calls)).not.toContain(env.JWT_SECRET);
	});
});

describe('production commit verification', () => {
	const commit = 'a'.repeat(40);
	const deployedEnv = { ...env, GITHUB_SHA: commit };

	it('waits for the expected application commit before initializing', async () => {
		const fetchImpl = vi.fn()
			.mockResolvedValueOnce(Response.json({ commit: 'b'.repeat(40) }))
			.mockResolvedValueOnce(Response.json({ commit }))
			.mockResolvedValueOnce(new Response('success'));
		const sleep = vi.fn();
		await initializeApp(deployedEnv, { fetchImpl, sleep });
		expect(fetchImpl.mock.calls[0][0]).toContain('/deployment.json?');
		expect(fetchImpl.mock.calls[1][0]).toContain('/deployment.json?');
		expect(fetchImpl.mock.calls[2][0]).toContain('/api/init/');
		expect(sleep).toHaveBeenCalledOnce();
	});

	it('does not initialize production when only a Preview has updated', async () => {
		const fetchImpl = vi.fn().mockImplementation(async () => Response.json({ commit: 'b'.repeat(40) }));
		await expect(initializeApp(deployedEnv, { fetchImpl, sleep: vi.fn() })).rejects.toThrow('successful Preview does not update production');
		expect(fetchImpl.mock.calls.some(([url]) => url.includes('/api/init/'))).toBe(false);
	});

	it('waits through the SPA fallback for an application without the version file', async () => {
		const fetchImpl = vi.fn()
			.mockResolvedValueOnce(new Response('<html>Old application</html>'))
			.mockResolvedValueOnce(Response.json({ commit }));
		await waitForApplication(deployedEnv, { fetchImpl, sleep: vi.fn() });
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(fetchImpl.mock.calls[0][1].cache).toBe('no-store');
	});

	it('does not accept an HTTP error page as proof of deployment', async () => {
		const fetchImpl = vi.fn().mockImplementation(async () => Response.json({ commit }, { status: 503 }));
		await expect(waitForApplication(deployedEnv, { fetchImpl, sleep: vi.fn(), maxAttempts: 2 })).rejects.toThrow('not serving this commit');
	});

	it('does not expose the initialization secret during version verification', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(Response.json({ commit }));
		await waitForApplication(deployedEnv, { fetchImpl });
		expect(fetchImpl.mock.calls[0][0]).not.toContain(env.JWT_SECRET);
	});

	it('rejects a missing commit SHA before making requests', async () => {
		const fetchImpl = vi.fn();
		await expect(waitForApplication(env, { fetchImpl })).rejects.toThrow('full GitHub commit SHA');
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});

describe('Cloudflare Access diagnostics', () => {
	it('reports an Access login redirect immediately instead of misreporting an old version', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(new Response('', {
			status: 302, headers: { Location: 'https://example.cloudflareaccess.com/cdn-cgi/access/login/app' }
		}));
		await expect(waitForApplication({ ...env, GITHUB_SHA: 'a'.repeat(40) }, { fetchImpl })).rejects.toThrow('Cloudflare Access blocks initialization');
		expect(fetchImpl).toHaveBeenCalledOnce();
	});

	it('reports an Access redirect from the initialization endpoint without retrying it', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(new Response('', {
			status: 302, headers: { Location: '/cdn-cgi/access/login' }
		}));
		await expect(initializeApp(env, { fetchImpl })).rejects.toThrow('Cloudflare Access blocks initialization');
		expect(fetchImpl).toHaveBeenCalledOnce();
	});

	it('does not forward initialization credentials to an unexpected redirect target', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 302, headers: { Location: 'https://other.example.com/' } }));
		await expect(initializeApp(env, { fetchImpl })).rejects.toThrow('redirected this request');
		expect(fetchImpl).toHaveBeenCalledOnce();
	});
});

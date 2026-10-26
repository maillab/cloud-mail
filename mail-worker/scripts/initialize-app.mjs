import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

class ApplicationAccessError extends Error {}

async function fetchApplication(url, fetchImpl, options) {
	const response = await fetchImpl(url, { ...options, redirect: 'manual' });
	if (response.status >= 300 && response.status < 400) {
		const location = response.headers.get('Location') || '';
		if (location.includes('.cloudflareaccess.com/') || location.includes('/cdn-cgi/access/')) {
			throw new ApplicationAccessError('Cloudflare Access blocks initialization. Configure endpoint-specific Access policies for /deployment.json and /api/init/*');
		}
		throw new ApplicationAccessError('The application redirected this request. Check DOMAIN/APP_URL; redirects are not followed with initialization credentials');
	}
	return response;
}

export function applicationUrl(env) {
	let address = (env.APP_URL || env.DOMAIN || '').trim();
	if (address.startsWith('[')) {
		try {
			const domains = JSON.parse(address);
			address = typeof domains[0] === 'string' ? domains[0].trim() : '';
		} catch {
			throw new Error('DOMAIN must be an application hostname or a valid domain array; set APP_URL for a separate application URL');
		}
	}
	let url;
	try {
		url = new URL(address.includes('://') ? address : `https://${address}`);
	} catch {
		throw new Error('Set DOMAIN or APP_URL to the deployed application address');
	}
	if (!address || url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
		throw new Error('DOMAIN or APP_URL must be an HTTPS application origin without credentials, paths, or query parameters');
	}
	return url.origin;
}

export async function waitForApplication(env, { fetchImpl = fetch, sleep = setTimeout, maxAttempts = 12 } = {}) {
	const origin = applicationUrl(env);
	if (!/^[a-f\d]{40}$/i.test(env.GITHUB_SHA || '')) throw new Error('A full GitHub commit SHA is required to verify the deployed application');
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		let info;
		try {
			const response = await fetchApplication(`${origin}/deployment.json?commit=${env.GITHUB_SHA}&attempt=${attempt}`, fetchImpl, {
				cache: 'no-store',
				headers: { 'Cache-Control': 'no-cache' },
				signal: AbortSignal.timeout(15000)
			});
			if (response.ok) info = await response.json();
		} catch (error) {
			if (error instanceof ApplicationAccessError) throw error;
			// 旧版本可能没有版本文件，或仍返回 SPA 页面；等待正式部署生效。
		}
		if (info?.commit === env.GITHUB_SHA) {
			console.log(`Production application is serving commit ${env.GITHUB_SHA.slice(0, 7)}`);
			return;
		}
		if (attempt < maxAttempts) {
			console.log(`Waiting for production application commit ${env.GITHUB_SHA.slice(0, 7)} (${attempt}/${maxAttempts})`);
			await sleep(10000);
		}
	}
	throw new Error('The application is not serving this commit. Check the Cloudflare Production branch and deploy command; a successful Preview does not update production');
}

export async function initializeApp(env, { fetchImpl = fetch, sleep = setTimeout } = {}) {
	const origin = applicationUrl(env);
	const secret = env.JWT_SECRET;
	if (typeof secret !== 'string' || !secret.trim() || /[\r\n]/.test(secret)) {
		throw new Error('JWT_SECRET must match the deployed Worker runtime variable jwt_secret');
	}
	if (env.GITHUB_ACTIONS === 'true') console.log(`::add-mask::${secret}`);
	if (env.GITHUB_SHA) await waitForApplication(env, { fetchImpl, sleep });
	const endpoint = `${origin}/api/init/${encodeURIComponent(secret)}`;
	const maxAttempts = 5;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		let response;
		let body;
		try {
			response = await fetchApplication(endpoint, fetchImpl, { signal: AbortSignal.timeout(60000) });
			body = (await response.text()).trim();
		} catch (error) {
			if (error instanceof ApplicationAccessError) throw error;
			response = undefined;
			if (attempt === maxAttempts) {
				throw new Error('Cannot reach the application. Confirm Cloudflare deployment succeeded and DOMAIN/APP_URL is correct');
			}
		}
		if (response) {
			if (response.ok && body === 'success') {
				console.log(`Application initialized successfully: ${origin}`);
				return;
			}
			if (body.includes('JWT secret mismatch')) {
				throw new Error('JWT_SECRET does not match the deployed Worker runtime variable jwt_secret');
			}
			if (response.status < 500 || attempt === maxAttempts) {
				throw new Error(`Initialization did not return success (HTTP ${response.status}). Check KV/D1 bindings and Worker logs`);
			}
		}
		console.log(`Application temporarily unavailable; retrying initialization (${attempt}/${maxAttempts})`);
		await sleep(10000);
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	initializeApp(process.env).catch(error => {
		console.error(error.message);
		process.exitCode = 1;
	});
}

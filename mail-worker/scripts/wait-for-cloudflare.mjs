import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

export async function waitForCloudflare(env, { fetchImpl = fetch, sleep = setTimeout, maxAttempts = 60 } = {}) {
	if (!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY || '') || !/^[a-f\d]{40}$/i.test(env.GITHUB_SHA || '') || !env.GH_TOKEN) {
		throw new Error('GitHub repository, commit SHA, and workflow token are required to read build checks');
	}
	const checkName = `Workers Builds: ${env.NAME || 'cloud-mail'}`;
	const endpoint = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/commits/${env.GITHUB_SHA}/check-runs?per_page=100&filter=latest&check_name=${encodeURIComponent(checkName)}`;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const response = await fetchImpl(endpoint, {
			headers: {
				Authorization: `Bearer ${env.GH_TOKEN}`,
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28'
			},
			signal: AbortSignal.timeout(30000)
		});
		const data = await response.json().catch(() => null);
		if (!response.ok || !Array.isArray(data?.check_runs)) {
			throw new Error(`Cannot read GitHub build checks (HTTP ${response.status}); initialization stopped`);
		}
		const check = data.check_runs
			.filter(item => item.name === checkName && item.app?.slug === 'cloudflare-workers-and-pages' && item.head_sha === env.GITHUB_SHA)
			.sort((a, b) => b.id - a.id)[0];
		if (check?.status === 'completed') {
			if (check.conclusion !== 'success') {
				throw new Error(`Cloudflare deployment ${check.conclusion || 'did not succeed'}; initialization stopped`);
			}
			console.log(`Cloudflare build passed for commit ${env.GITHUB_SHA.slice(0, 7)}`);
			return;
		}
		if (attempt < maxAttempts) {
			console.log(`Waiting for ${checkName} on commit ${env.GITHUB_SHA.slice(0, 7)} (${attempt}/${maxAttempts})`);
			await sleep(15000);
		}
	}
	throw new Error('Timed out waiting for Cloudflare deployment. Check its connected branch, build watch paths, and build logs');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	waitForCloudflare(process.env).catch(error => {
		console.error(error.message);
		process.exitCode = 1;
	});
}

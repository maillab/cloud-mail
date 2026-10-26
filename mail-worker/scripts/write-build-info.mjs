import { execFileSync } from 'node:child_process';
import { access, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workerDirectory = dirname(dirname(fileURLToPath(import.meta.url)));

export function buildCommit(env = process.env) {
	let commit = env.WORKERS_CI_COMMIT_SHA || env.GITHUB_SHA;
	if (!commit) {
		try {
			commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workerDirectory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
		} catch {
			return null;
		}
	}
	if (!/^[a-f\d]{40}$/i.test(commit)) throw new Error('Build commit must be a full Git commit SHA');
	return commit;
}

export async function writeBuildInfo(env = process.env, outputDirectory = resolve(workerDirectory, 'dist')) {
	// 必须先有完整的前端构建，再发布提交号，避免仅有版本文件被误判为构建成功。
	await access(resolve(outputDirectory, 'index.html'));
	await writeFile(resolve(outputDirectory, 'deployment.json'), JSON.stringify({ commit: buildCommit(env) }) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	writeBuildInfo().catch(error => {
		console.error(error.message);
		process.exitCode = 1;
	});
}

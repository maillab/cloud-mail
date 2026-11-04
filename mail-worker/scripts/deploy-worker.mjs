import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { unstable_readConfig } from 'wrangler';

export function validateDeployConfig(config) {
	const concrete = value => typeof value === 'string' && value.trim() && !value.includes('${');
	if (!concrete(config.name) || !concrete(config.main)) throw new Error('Deployment requires a concrete Worker name and entry.');
	if (!config.d1_databases?.some(binding => binding.binding === 'db' && concrete(binding.database_id))) throw new Error('Deployment stopped: configure the existing db D1 binding; the default template has no database binding.');
	if (!config.kv_namespaces?.some(binding => binding.binding === 'kv' && concrete(binding.id))) throw new Error('Deployment stopped: configure the existing kv namespace binding.');
	if (config.assets?.binding !== 'assets') throw new Error('Deployment requires the assets binding.');
	return config;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const args = process.argv.slice(2);
	if (args.length && (args.length !== 2 || args[0] !== '--config')) throw new Error('Usage: node scripts/deploy-worker.mjs [--config wrangler-production.toml]');
	const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
	const configPath = resolve(workerRoot, args[1] || 'wrangler.toml');
	const config = validateDeployConfig(unstable_readConfig({ config: configPath }, { hideWarnings: true }));
	if (!existsSync(config.main)) throw new Error('Deployment entry does not exist.');
	const require = createRequire(import.meta.url);
	const wranglerCli = resolve(dirname(require.resolve('wrangler')), '../bin/wrangler.js');
	const result = spawnSync(process.execPath, [wranglerCli, 'deploy', '--config', configPath], { cwd: workerRoot, stdio: 'inherit' });
	if (result.error) throw result.error;
	process.exitCode = result.status ?? 1;
}

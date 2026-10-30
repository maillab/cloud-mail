import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(join(realpathSync(join(root, 'node_modules/wrangler')), 'package.json'));
const { build } = require('esbuild');

// Bundle the Sendflare client; stub email-service so the test records status updates.
await build({
	entryPoints: [join(root, 'src/service/sendflare-service.js')],
	outfile: join(root, '.wrangler/sendflare-tests.mjs'),
	bundle: true,
	platform: 'node',
	format: 'esm',
	plugins: [{
		name: 'sendflare-fixtures',
		setup(build) {
			build.onResolve({ filter: /\/email-service$/ }, args => ({ path: 'email-service', namespace: 'fixture' }));
			build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
				contents: `export default {
					updates: (globalThis.sendflareUpdates = []),
					async toAttachmentBase64(att) { return att.content; },
					async updateEmailStatus(c, params) { this.updates.push(params); return params.resendEmailId === 'known' ? {} : null; }
				};`
			}));
		}
	}]
});

const result = spawnSync(process.execPath, ['--test', join(root, 'test/sendflare.spec.mjs')], { stdio: 'inherit' });
process.exit(result.status ?? 1);

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from '../../scripts/test-module-loader.mjs';

test('interleaved requests retain their own translator across await and non-HTTP events default to Chinese', async () => {
	const { tFor } = await loadModule(new URL('../../src/i18n/i18n.ts', import.meta.url));
	const english = tFor({ env: {}, req: { header: () => 'en-US' } });
	const chinese = tFor({ env: {}, req: { header: () => 'zh-CN' } });
	const initial = english('IncorrectPwd');
	assert.notEqual(initial, chinese('IncorrectPwd'));
	await Promise.resolve();
	assert.equal(english('IncorrectPwd'), initial);
	assert.equal(tFor({ env: {} })('IncorrectPwd'), '密码输入错误');
	assert.equal(tFor({ env: {}, req: { header: () => undefined } })('IncorrectPwd'), '密码输入错误');
});

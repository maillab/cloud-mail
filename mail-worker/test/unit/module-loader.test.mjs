import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadModule, resolveSourcePath } from '../../scripts/test-module-loader.mjs';

async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), 'cloud-mail-loader-fixture-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test('loader compiles real multiline JS imports and TS dependencies with named/default exports', async t => {
  const root = await directory(t);
  await writeFile(join(root, 'dependency.ts'), 'export interface Input { value: number }; export const value: Input = { value: 7 };');
  const entry = join(root, 'entry.js');
  const source = `import {
    value,
  } from './dependency';
  export { value };
  export default value.value;`;
  await writeFile(entry, source);
  const module = await loadModule(entry);
  assert.equal(module.default, 7);
  assert.deepEqual(module.value, { value: 7 });
  assert.equal(await readFile(entry, 'utf8'), source);
});

test('explicit missing extensions fail and extensionless references resolve the actual TypeScript module', async t => {
  const root = await directory(t);
  const entry = join(root, 'entry.js');
  await writeFile(entry, 'export default 9;');
  assert.equal((await loadModule(entry)).default, 9);
  await rename(entry, join(root, 'entry.ts'));
  await writeFile(join(root, 'entry.ts'), 'const value: number = 9; export default value;');
  await assert.rejects(resolveSourcePath(entry), /Test module does not exist/);
  assert.equal(await resolveSourcePath(join(root, 'entry')), join(root, 'entry.ts'));
  assert.equal((await loadModule(join(root, 'entry.ts'))).default, 9);
});

test('parallel JS/TS implementations fail rather than silently selecting a version', async t => {
  const root = await directory(t);
  await writeFile(join(root, 'entry.js'), 'export default "old";');
  await writeFile(join(root, 'entry.ts'), 'export default "new";');
  await assert.rejects(loadModule(join(root, 'entry')), /Multiple test module implementations/);
});

test('explicit dependency mocks retain object identity without touching other imports', async t => {
  const root = await directory(t);
  const dependency = join(root, 'dependency.ts');
  await writeFile(dependency, 'export default { value: "real" }; export const read = () => "real";');
  await writeFile(join(root, 'other.ts'), 'export const other: string = "unmocked";');
  await writeFile(join(root, 'entry.ts'), `import dependency, { read } from './dependency';
    import { other } from './other';
    export default dependency; export { read, other };`);
  const mock = { value: 'fixture' };
  const read = () => mock.value;
  const module = await loadModule(join(root, 'entry'), { mocks: new Map([[dependency, { default: mock, read }]]) });
  assert.equal(module.default, mock);
  assert.equal(module.read, read);
  assert.equal(module.other, 'unmocked');
  mock.value = 'changed';
  assert.equal(module.read(), 'changed');
});

test('independent module loads isolate singleton state and concurrent dependency fixtures', async t => {
  const root = await directory(t);
  const dependency = join(root, 'dependency.js');
  await writeFile(dependency, 'export default { count: 0 };');
  await writeFile(join(root, 'entry.js'), `import state from './dependency'; export default state;`);
  const entry = join(root, 'entry');
  const [first, second] = await Promise.all([loadModule(entry), loadModule(entry)]);
  first.default.count = 5;
  assert.equal(second.default.count, 0);
  const [left, right] = await Promise.all([
    loadModule(entry, { mocks: new Map([[dependency, { default: { count: 1 } }]]) }),
    loadModule(entry, { mocks: new Map([[dependency, { default: { count: 2 } }]]) }),
  ]);
  assert.equal(left.default.count, 1);
  assert.equal(right.default.count, 2);
});

test('optional require failures retain esbuild try/catch semantics instead of becoming plugin errors', async t => {
  const root = await directory(t);
  await writeFile(join(root, 'optional.cjs'), `let value = 'fallback';
    try { value = require('cloud-mail-intentionally-missing-optional-module'); } catch {}
    module.exports = value;`);
  await writeFile(join(root, 'entry.js'), `import value from './optional.cjs'; export default value;`);
  assert.equal((await loadModule(join(root, 'entry'))).default, 'fallback');
});

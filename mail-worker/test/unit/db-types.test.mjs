import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

test('entity type bridges retain historical scalar/null unions and typed list projections', async () => {
  const workerRoot = fileURLToPath(new URL('../../', import.meta.url));
  const evidenceRoot = join(workerRoot, '.wrangler');
  await mkdir(evidenceRoot, { recursive: true });
  const directory = await mkdtemp(join(evidenceRoot, 'db-type-contract-'));
  try {
    const fixture = join(directory, 'contract.ts');
    const importPath = path => JSON.stringify(join(workerRoot, 'src', path).replaceAll('\\', '/'));
    await writeFile(fixture, `
      import user from ${importPath('entity/user')};
      import role from ${importPath('entity/role')};
      import { att } from ${importPath('entity/att')};
      import verifyRecord from ${importPath('entity/verify-record')};
      import { oauth } from ${importPath('entity/oauth')};
      import email from ${importPath('entity/email')};
      import { emailBriefColumns } from ${importPath('lib/email-list-columns')};
      import { drizzle } from 'drizzle-orm/d1';
      type Equal<A,B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
      type Assert<T extends true> = T;
      const query = drizzle({} as D1Database).select(emailBriefColumns).from(email);
      type Brief = Awaited<ReturnType<typeof query.all>>[number];
      export type Contracts = [
        Assert<Equal<typeof user.$inferSelect.sort, number | string | null>>,
        Assert<Equal<typeof user.$inferSelect.sendCount, number | string | null>>,
        Assert<Equal<typeof att.$inferSelect.status, number | string>>,
        Assert<Equal<typeof verifyRecord.$inferSelect.ip, number | string>>,
        Assert<Equal<typeof oauth.$inferSelect.platform, number | string | null>>,
        Assert<Equal<typeof role.$inferSelect.key, string | null>>,
        Assert<Equal<Brief['content'], string | null>>,
        Assert<Equal<Brief['text'], string>>
      ];
      export const legacyRole: typeof role.$inferInsert = { name: 'Legacy role', key: null };
    `);
    const configPath = join(workerRoot, 'tsconfig.json');
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    assert.equal(config.error, undefined);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, workerRoot);
    assert.deepEqual(parsed.errors, []);
    const program = ts.createProgram([fixture], parsed.options);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => workerRoot,
      getCanonicalFileName: path => path,
      getNewLine: () => '\n',
    }));
  } finally {
    assert.equal(dirname(directory), evidenceRoot);
    await rm(directory, { recursive: true, force: true });
  }
});

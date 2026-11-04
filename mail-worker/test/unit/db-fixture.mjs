import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';

/** Execute the frozen real DDL with a SQLite adapter; native D1 is covered separately. */
export async function databaseFixture(t) {
  const database = new DatabaseSync(':memory:');
  t.after(() => database.close());
  const schema = JSON.parse(await readFile(new URL('../fixtures/schema.json', import.meta.url), 'utf8'));
  for (const entry of schema.filter(entry => entry.type === 'table')) database.exec(entry.sql);
  for (const entry of schema.filter(entry => entry.type === 'index' && entry.sql)) database.exec(entry.sql);
  const queries = [];
  const db = { prepare(sql) {
    const statement = params => ({
      bind(...values) { return statement(values); },
      async raw() {
        queries.push({ sql, params });
        const prepared = database.prepare(sql); prepared.setReturnArrays(true);
        return prepared.all(...params);
      },
      async all() {
        queries.push({ sql, params });
        return { success: true, results: database.prepare(sql).all(...params).map(row => ({ ...row })) };
      },
      async first(column) {
        queries.push({ sql, params });
        const row = database.prepare(sql).get(...params);
        return row ? column ? row[column] : { ...row } : null;
      },
      async run() {
        queries.push({ sql, params });
        const result = database.prepare(sql).run(...params);
        return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
    });
    return statement([]);
  } };
  const context = { env: { db }, req: { header: name => name.toLowerCase() === 'cf-connecting-ip' ? '127.0.0.1' : undefined } };
  return { database, db, context, queries };
}

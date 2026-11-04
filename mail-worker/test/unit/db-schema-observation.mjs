const insertValues = {
  perm: { name: 'Read mail', permKey: 'email.read' },
  rolePerm: { roleId: 2, permId: 1 },
  star: { userId: 4, emailId: 7 },
  regKey: { code: 'fixture-key', count: 2 },
  role: { name: 'Fixture role', key: 'fixture-role', description: null },
  account: { email: 'fixture@example.test', userId: 4 },
  user: { email: 'fixture@example.test', password: 'fixture-hash', salt: 'fixture-salt' },
  oauth: { platform: 'google', oauthUserId: 'fixture-subject' },
  verifyRecord: { ip: '127.0.0.1' },
  att: { userId: 4, emailId: 7, accountId: 2, key: 'attachments/fixture.png' },
  email: { accountId: 2, userId: 4, recipient: '["recipient@example.test"]' },
  setting: {},
};

const mapperInputs = [null, 0, 1, '0', '5', '', '{"fixture":1}', 0.88];

function observeMapper(column, method) {
  const observations = mapperInputs.map(value => {
    try {
      return { input: value, output: column[method](value) };
    } catch (error) {
      return { input: value, error: error.message };
    }
  });
  return observations.every(({ input, output, error }) => error === undefined && Object.is(input, output))
    ? 'identity-on-baseline-samples' : observations;
}

/** Captures pre-migration behavior, rather than generating an expected schema. */
export function observeSchema(module) {
  const { tables, getTableConfig, getTableColumns, SQLiteSyncDialect, drizzle, eq, sql } = module;
  const dialect = new SQLiteSyncDialect();
  const db = drizzle({ prepare() { throw new Error('SQL snapshots must not execute a query'); } });
  const schema = {};
  const queries = {};

  for (const [entity, table] of Object.entries(tables)) {
    const config = getTableConfig(table);
    const columns = getTableColumns(table);
    schema[entity] = {
      table: config.name,
      columns: Object.fromEntries(Object.entries(columns).map(([property, column]) => [property, {
        name: column.name,
        sqlType: column.getSQLType(),
        columnType: column.columnType,
        dataType: column.dataType,
        notNull: column.notNull,
        primary: column.primary,
        autoIncrement: column.autoIncrement ?? false,
        hasDefault: column.hasDefault,
        default: column.default === undefined ? { kind: 'none' }
          : typeof column.default === 'object' && column.default !== null && 'queryChunks' in column.default
            ? { kind: 'sql', ...dialect.sqlToQuery(column.default) }
            : { kind: 'value', value: column.default },
        fromDriver: observeMapper(column, 'mapFromDriverValue'),
        toDriver: observeMapper(column, 'mapToDriverValue'),
      }]))
    };
    const values = insertValues[entity];
    const primary = Object.values(columns).find(column => column.primary);
    const condition = primary ? eq(primary, 7) : sql`${1} = ${1}`;
    const updateValues = Object.keys(values).length ? values : { title: 'Fixture title' };
    queries[entity] = {
      select: db.select().from(table).where(condition).toSQL(),
      insert: db.insert(table).values(values).returning().toSQL(),
      update: db.update(table).set(updateValues).where(condition).returning().toSQL(),
    };
  }

  queries.emailBrief = db.select(module.emailBriefColumns).from(tables.email).where(eq(tables.email.userId, 4)).toSQL();
  queries.emailFull = db.select(module.emailListColumns).from(tables.email).where(eq(tables.email.userId, 4)).toSQL();
  return { schema, queries, emailListTextLength: module.EMAIL_LIST_TEXT_LEN };
}

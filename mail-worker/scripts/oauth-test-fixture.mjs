import { DatabaseSync } from 'node:sqlite';
import { loadModule } from './test-module-loader.mjs';

const source = path => new URL(`../src/${path}`, import.meta.url);
export const googleIdentity = { oauthUserId: 'google-sub', platform: 'google' };

/** Local SQLite executes the production Drizzle SQL; this is not a D1 emulator. */
export async function createOAuthFixture(testContext) {
  const database = new DatabaseSync(':memory:');
  testContext.after(() => database.close());
  // Match the existing v2_4DB table, including its historical INTEGER platform.
  database.exec(`CREATE TABLE oauth (
    oauth_id INTEGER PRIMARY KEY AUTOINCREMENT,
    oauth_user_id TEXT, username TEXT, name TEXT, avatar TEXT,
    active INTEGER, trust_level INTEGER, silenced INTEGER,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    platform INTEGER NOT NULL DEFAULT 0, user_id INTEGER NOT NULL DEFAULT 0
  ); INSERT INTO oauth (oauth_id, oauth_user_id, platform) VALUES (1, 'google-sub', 'google');`);
  const queries = [];
  const db = {
    prepare(sql) {
      return { bind(...params) {
        queries.push({ sql, params });
        return {
          async raw() {
            const statement = database.prepare(sql);
            statement.setReturnArrays(true);
            return statement.all(...params);
          },
          async all() { return { success: true, results: database.prepare(sql).all(...params) }; },
          async run() {
            const result = database.prepare(sql).run(...params);
            return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
          },
        };
      } };
    },
  };
  const state = { user: null, registers: 0, enabled: 0, registerCalls: [], loginCalls: [] };
  const context = { env: { db, jwt_secret: 'test-only-oauth-secret' } };
  const userService = {
    async selectByIdIncludeDel(c, id) { return state.user?.userId === id ? state.user : null; },
    async selectByEmail(c, email) { return state.user?.email === email ? state.user : null; },
  };
  const loginService = {
    async register(c, params, oauth) {
      state.registers++;
      state.registerCalls.push({ params, oauth });
      state.user = { userId: 7, email: params.email };
    },
    async login(c, params, oauth) {
      state.loginCalls.push({ params, oauth });
      return 'mail-session';
    },
  };
  const settingsReader = { async query() { return {
    googleSwitch: state.enabled, githubSwitch: state.enabled, linuxdoSwitch: state.enabled,
    googleClientId: 'fixture-google-client', googleClientSecret: 'fixture-google-secret',
    githubClientId: 'fixture-github-client', githubClientSecret: 'fixture-github-secret',
    linuxdoClientId: 'fixture-linuxdo-client', linuxdoClientSecret: 'fixture-linuxdo-secret',
  }; } };
  const { default: service } = await loadModule(source('service/oauth-service'), { mocks: new Map([
    [source('dao/user-dao'), { default: userService }],
    [source('service/login-service'), { default: loginService }],
    [source('service/settings-reader'), { default: settingsReader }],
    [source('i18n/i18n'), { t: key => key, tFor: () => key => key }],
  ]) });
  const { default: jwt } = await loadModule(source('utils/jwt-utils'));
  return {
    service, jwt, context, state, queries, database,
    row: () => database.prepare('SELECT * FROM oauth WHERE oauth_id = 1').get(),
    bindExistingUser() {
      state.user = { userId: 7, email: 'existing@example.test' };
      database.prepare('UPDATE oauth SET user_id = 7 WHERE oauth_id = 1').run();
    },
  };
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from '../../scripts/test-module-loader.mjs';
import { databaseFixture } from './db-fixture.mjs';

const source = path => new URL(`../../src/${path}`, import.meta.url);
const schema = await loadModule(new URL('./db-schema-module.mjs', import.meta.url));
const mocks = new Map([[source('i18n/i18n'), { t: key => key, tFor: () => key => key }]]);
const { default: roleService } = await loadModule(source('service/role-service'), { mocks });
const { default: permService } = await loadModule(source('service/perm-service'), { mocks });

test('role insert preserves omitted-key NULL SQL, CSV values and string ID bindings', async t => {
  const h = await databaseFixture(t);
  h.database.exec("INSERT INTO perm (perm_id,name,pid,type) VALUES (7,'read',0,2)");
  const params = { name: 'Fixture role', banEmail: ['blocked.test'], availDomain: ['example.test'], permIds: ['7'] };
  const expected = schema.drizzle({ prepare() { throw new Error('No execution'); } }).insert(schema.tables.role).values({ ...params, banEmail: 'blocked.test', availDomain: 'example.test', userId: '8' }).returning().toSQL();
  await roleService.add(h.context, params, '8');
  assert.deepEqual(h.queries.find(query => query.sql.startsWith('insert into "role"')), expected);
  const roles = await roleService.roleList(h.context);
  assert.equal(roles.length, 1);
  assert.equal(roles[0].key, null);
  assert.deepEqual(roles[0].banEmail, ['blocked.test']);
  assert.deepEqual(roles[0].availDomain, ['example.test']);
  assert.deepEqual(roles[0].permIds, [7]);
});

test('role update deletes old permissions and retains string role ID parameters', async t => {
  const h = await databaseFixture(t);
  h.database.exec("INSERT INTO role (role_id,name,key,ban_email,avail_domain) VALUES (2,'before','key','',''); INSERT INTO role_perm (role_id,perm_id) VALUES (2,1)");
  const params = { roleId: '2', name: 'after', banEmail: [], availDomain: [], permIds: ['9'], isDefault: 1 };
  await roleService.setRole(h.context, params);
  assert.equal(params.isDefault, undefined);
  assert.deepEqual(h.database.prepare('SELECT role_id,perm_id FROM role_perm').all().map(row => ({ ...row })), [{ role_id: 2, perm_id: 9 }]);
  assert.equal(h.database.prepare('SELECT name,is_default FROM role WHERE role_id=2').get().name, 'after');
  assert.equal(h.database.prepare('SELECT is_default FROM role WHERE role_id=2').get().is_default, 0);
  assert.ok(h.queries.filter(query => query.sql.startsWith('update "role"')).some(query => query.params.includes('2')));
});

test('role/permission lookup keeps SQL string IDs and null permission keys', async t => {
  const h = await databaseFixture(t);
  h.database.exec(`INSERT INTO user (user_id,email,type,password,salt) VALUES (4,'fixture@example.test',2,'hash','salt');
    INSERT INTO role (role_id,name,key,ban_email,avail_domain) VALUES (2,'member',NULL,'','');
    INSERT INTO perm (perm_id,name,perm_key,pid,type) VALUES (1,'read',NULL,0,2);
    INSERT INTO role_perm (role_id,perm_id) VALUES (2,1);`);
  assert.deepEqual(await permService.userPermKeys(h.context, '4'), [null]);
  assert.equal((await roleService.selectByUserId(h.context, '4')).key, null);
  assert.ok(h.queries.some(query => query.params.includes('4')));
  assert.deepEqual(await roleService.selectByUserIds(h.context, []), []);
  assert.deepEqual(await roleService.selectByIdsHasPermKey(h.context, [], 'email.read'), []);
});

test('permission tree preserves translated names and child rows', async t => {
  const h = await databaseFixture(t);
  h.database.exec("INSERT INTO perm (perm_id,name,pid,type,sort) VALUES (1,'mail',0,0,1),(2,'read',1,1,1)");
  const tree = await permService.tree(h.context);
  assert.equal(tree[0].name, 'perms.mail');
  assert.equal(tree[0].children[0].name, 'perms.read');
});

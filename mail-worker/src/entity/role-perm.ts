import { sqliteTable, integer} from 'drizzle-orm/sqlite-core';
export const rolePerm = sqliteTable('role_perm', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	roleId: integer('role_id'),
	permId: integer('perm_id')
});
export default rolePerm

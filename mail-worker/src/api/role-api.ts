import type { Hono } from 'hono';
import type { AppEnvironment } from '../types/context';
import roleService from '../service/role-service';
import userContext from '../security/user-context';
import result from '../model/result';
import permService from '../service/perm-service';
import type { RoleInput, RoleIdInput } from '../types/admin';

export function registerRoleApi(app: Hono<AppEnvironment>) {
	app.post('/role/add', async (c) => {
		await roleService.add(c, await c.req.json<RoleInput>(), userContext.getUserId(c));
		return c.json(result.ok());
	});

	app.put('/role/setDefault', async (c) => {
		await roleService.setDefault(c, await c.req.json<RoleIdInput>());
		return c.json(result.ok());
	});

	app.put('/role/set', async (c) => {
		await roleService.setRole(c, await c.req.json<RoleInput & RoleIdInput>());
		return c.json(result.ok());
	});

	app.get('/role/tree', async (c) => {
		const tree = await permService.tree(c);
		return c.json(result.ok(tree));
	});

	app.delete('/role/delete', async (c) => {
		const params = c.req.query();
		await roleService.delete(c, { roleId: params.roleId });
		return c.json(result.ok());
	});

	app.get('/role/list', async (c) => {
		const roleList = await roleService.roleList(c);
		return c.json(result.ok(roleList));
	});

	app.get('/role/selectUse', async (c) => {
		const roleList = await roleService.roleSelectUse(c);
		return c.json(result.ok(roleList));
	});
}

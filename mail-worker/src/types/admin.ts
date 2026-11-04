import type perm from '../entity/perm';
import type role from '../entity/role';
import type regKey from '../entity/reg-key';
import type { ScalarId } from './api';

export type PermRow = typeof perm.$inferSelect;
export type PermTreeNode = PermRow & { children?: PermRow[] };
export type RoleRow = typeof role.$inferSelect;
export type RoleListItem = Omit<RoleRow, 'banEmail' | 'availDomain'> & {
	banEmail: string[];
	availDomain: string[];
	permIds?: (number | null)[];
};
export type RoleInput = Omit<typeof role.$inferInsert, 'banEmail' | 'availDomain' | 'roleId' | 'key'> & {
	roleId?: ScalarId;
	key?: string | null;
	banEmail: string[];
	availDomain: string[];
	permIds: ScalarId[];
};
export interface RoleIdInput { roleId: ScalarId }
export type RegKeyListItem = typeof regKey.$inferSelect & { roleName?: string };
export interface RegKeyInput { code: string; roleId: ScalarId; count: number; expireTime: string }
export interface RegKeyDeleteInput { regKeyIds: string }
export interface RegKeyListQuery { code?: string }
export interface RegKeyHistoryQuery { regKeyId: ScalarId }

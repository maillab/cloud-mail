import type user from '../entity/user';
import type account from '../entity/account';
import type { oauth } from '../entity/oauth';
import type { ScalarId } from './api';

export type UserRow = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type AccountRow = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;
export type OAuthRow = typeof oauth.$inferSelect;
export interface UserListQuery {
	num?: string | number; size?: string | number; email?: string;
	timeSort?: string | number; status?: string | number; isDel?: string | number;
}
export interface AccountListQuery { accountId?: string | number; size?: string | number; lastSort?: string | number }
export interface PageQuery { userId: ScalarId; num?: string | number; size?: string | number }
export interface AccountIdInput { accountId: ScalarId }
export interface UserIdInput { userId: ScalarId }
export interface PasswordInput { password: string }
export interface AddUserInput { email: string; password: string; type?: number }
export interface SendAction { hasPerm: boolean; sendType?: string | null; sendCount?: number | null }

export type UserListItem = Pick<UserRow,
	'userId' | 'email' | 'type' | 'status' | 'createTime' | 'activeTime' | 'createIp' | 'activeIp' |
	'os' | 'browser' | 'device' | 'sort' | 'sendCount' | 'regKeyId' | 'isDel'
> & Pick<OAuthRow, 'username' | 'trustLevel' | 'avatar' | 'name' | 'platform'> & {
	receiveEmailCount: number;
	sendEmailCount: number;
	accountCount: number;
	delReceiveEmailCount: number;
	delSendEmailCount: number;
	delAccountCount: number;
	sendAction: SendAction;
};
export type UserListPage = { list: UserListItem[]; total: number };

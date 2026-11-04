// This entry imports production modules unchanged. The shared loader bundles
// their JS/TS imports; it does not replace the schema with a test definition.
import perm from '../../src/entity/perm';
import rolePerm from '../../src/entity/role-perm';
import { star } from '../../src/entity/star';
import regKey from '../../src/entity/reg-key';
import role from '../../src/entity/role';
import account from '../../src/entity/account';
import user from '../../src/entity/user';
import { oauth } from '../../src/entity/oauth';
import verifyRecord from '../../src/entity/verify-record';
import { att } from '../../src/entity/att';
import email from '../../src/entity/email';
import setting from '../../src/entity/setting';

export { getTableConfig, SQLiteSyncDialect, text, integer } from 'drizzle-orm/sqlite-core';
export { getTableColumns, eq, sql } from 'drizzle-orm';
export { drizzle } from 'drizzle-orm/d1';
export { EMAIL_LIST_TEXT_LEN, emailListColumns, emailBriefColumns } from '../../src/lib/email-list-columns';
export const tables = { perm, rolePerm, star, regKey, role, account, user, oauth, verifyRecord, att, email, setting };

import JwtUtils from '../utils/jwt-utils';
import constant from '../const/constant';
import type { HttpContext } from '../types/context';
import { requiredRow } from '../lib/required-row';
import { sessionFields } from './session-claims';

const userContext = {
	getUserId(c: Pick<HttpContext, 'get'>): number {
		return requiredRow(c.get('user'), 'userId').userId;
	},

	getUser(c: Pick<HttpContext, 'get'>) {
		return c.get('user');
	},

	async getToken(c: Pick<HttpContext, 'req' | 'env'>): Promise<unknown> {
		const jwt = c.req.header(constant.TOKEN_HEADER);
		const result = await JwtUtils.verifyToken(c,jwt);
		return sessionFields(result).token;
	},
};
export default userContext;

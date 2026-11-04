import BizError from '../error/biz-error';
import type { OAuthClientConfig, OAuthCodeRequest } from '../types/oauth';

/** Read existing JSON properties without claiming that provider JSON is a DTO. */
export function jsonProperty(value: unknown, key: string): unknown {
	if (value === null || value === undefined) {
		throw new TypeError(`Cannot read properties of ${String(value)} (reading '${key}')`);
	}
	return typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

/** Keep the original JSON object and the legacy primitive-assignment failures. */
export function setJsonProperty(value: unknown, key: string, field: unknown): asserts value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError(`Cannot create property '${key}' on ${typeof value} '${String(value)}'`);
	}
	(value as Record<string, unknown>)[key] = field;
}

async function responseJson(response: Response): Promise<unknown> {
	if (!response.ok) throw new BizError(response.statusText);
	return response.json();
}

function form(config: OAuthClientConfig, params: OAuthCodeRequest): URLSearchParams {
	const body = new URLSearchParams();
	// append() performed this exact string conversion in the JS implementation.
	body.append('client_id', String(config.clientId));
	body.append('client_secret', String(config.clientSecret));
	body.append('code', params.code);
	body.append('redirect_uri', params.redirectUri);
	body.append('grant_type', 'authorization_code');
	return body;
}

const oauthClient = {
	async linuxdo(config: OAuthClientConfig, params: OAuthCodeRequest): Promise<unknown> {
		const token = await responseJson(await fetch('https://connect.linux.do/oauth2/token', {
			method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: form(config, params).toString(),
		}));
		return responseJson(await fetch('https://connect.linux.do/api/user', {
			headers: { Authorization: 'Bearer ' + jsonProperty(token, 'access_token') },
		}));
	},

	async github(config: OAuthClientConfig, params: OAuthCodeRequest): Promise<unknown> {
		const token = await responseJson(await fetch('https://github.com/login/oauth/access_token', {
			method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code: params.code, redirect_uri: params.redirectUri }),
		}));
		const error = jsonProperty(token, 'error');
		if (error) {
			// Error(message) already coerced this provider value to a string.
			throw new BizError(String(jsonProperty(token, 'error_description') || error));
		}
		return responseJson(await fetch('https://api.github.com/user', {
			headers: { Authorization: 'Bearer ' + jsonProperty(token, 'access_token'), 'User-Agent': 'cloud-mail' },
		}));
	},

	async google(config: OAuthClientConfig, params: OAuthCodeRequest): Promise<unknown> {
		const token = await responseJson(await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: form(config, params).toString(),
		}));
		return responseJson(await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
			headers: { Authorization: 'Bearer ' + jsonProperty(token, 'access_token') },
		}));
	},
};

export default oauthClient;

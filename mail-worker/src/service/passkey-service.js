import {
	generateRegistrationOptions,
	verifyRegistrationResponse,
	generateAuthenticationOptions,
	verifyAuthenticationResponse
} from '@simplewebauthn/server';
import { isoBase64URL, isoUint8Array } from '@simplewebauthn/server/helpers';
import BizError from '../error/biz-error';
import orm from '../entity/orm';
import passkey from '../entity/passkey';
import userService from './user-service';
import loginService from './login-service';
import settingService from './setting-service';
import KvConst from '../const/kv-const';
import { isDel, userConst } from '../const/entity-const';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { t } from '../i18n/i18n.js';

const CHALLENGE_TTL = 300;
const MAX_PASSKEYS = 10;

function rpInfo(c) {
	const url = new URL(c.req.url);
	return {
		rpID: url.hostname,
		origin: url.origin
	};
}

async function rpName(c) {
	try {
		const setting = await settingService.query(c);
		if (setting && setting.title) {
			return setting.title;
		}
	} catch (e) {
		console.warn('passkey rpName fallback:', e.message);
	}
	return rpInfo(c).rpID;
}

const passkeyService = {

	async selectByCredentialId(c, credentialId) {
		return await orm(c).select().from(passkey)
			.where(and(eq(passkey.credentialId, credentialId), eq(passkey.isDel, isDel.NORMAL)))
			.get();
	},

	async list(c, userId) {
		const rows = await orm(c).select({
			passkeyId: passkey.passkeyId,
			name: passkey.name,
			transports: passkey.transports,
			createTime: passkey.createTime,
			lastUsedTime: passkey.lastUsedTime
		}).from(passkey)
			.where(and(eq(passkey.userId, userId), eq(passkey.isDel, isDel.NORMAL)))
			.orderBy(desc(passkey.createTime))
			.all();
		return rows;
	},

	async registerOptions(c, userId) {

		const userRow = await userService.selectById(c, userId);

		if (!userRow) {
			throw new BizError(t('authExpired'), 401);
		}

		const exists = await this.list(c, userId);

		if (exists.length >= MAX_PASSKEYS) {
			throw new BizError(t('passkeyLimit'));
		}

		const credentialRows = await orm(c).select({
			credentialId: passkey.credentialId,
			transports: passkey.transports
		}).from(passkey)
			.where(and(eq(passkey.userId, userId), eq(passkey.isDel, isDel.NORMAL)))
			.all();

		const { rpID } = rpInfo(c);

		const options = await generateRegistrationOptions({
			rpName: await rpName(c),
			rpID,
			userName: userRow.email,
			userID: isoUint8Array.fromUTF8String(String(userRow.userId)),
			authenticatorSelection: {
				residentKey: 'preferred',
				userVerification: 'preferred'
			},
			excludeCredentials: credentialRows.map(item => ({
				id: item.credentialId,
				transports: safeTransports(item.transports)
			}))
		});

		await c.env.kv.put(KvConst.PASSKEY_CHALLENGE + 'reg:' + userId, options.challenge, { expirationTtl: CHALLENGE_TTL });

		return options;
	},

	async registerVerify(c, userId, params) {

		const { response, name } = params;

		if (!response) {
			throw new BizError(t('passkeyVerifyFail'));
		}

		const key = KvConst.PASSKEY_CHALLENGE + 'reg:' + userId;
		const challenge = await c.env.kv.get(key);
		await c.env.kv.delete(key);

		if (!challenge) {
			throw new BizError(t('passkeyChallengeExpired'));
		}

		const userRow = await userService.selectById(c, userId);

		if (!userRow) {
			throw new BizError(t('authExpired'), 401);
		}

		const { rpID, origin } = rpInfo(c);

		let verification;

		try {
			verification = await verifyRegistrationResponse({
				response,
				expectedChallenge: challenge,
				expectedOrigin: origin,
				expectedRPID: rpID,
				requireUserVerification: false
			});
		} catch (e) {
			console.warn('passkey register verify fail:', e.message);
			throw new BizError(t('passkeyVerifyFail'));
		}

		if (!verification.verified) {
			throw new BizError(t('passkeyVerifyFail'));
		}

		const { credential } = verification.registrationInfo;

		const dup = await this.selectByCredentialId(c, credential.id);

		if (dup) {
			throw new BizError(t('passkeyExists'));
		}

		const { passkeyId } = await orm(c).insert(passkey).values({
			userId: userRow.userId,
			credentialId: credential.id,
			publicKey: isoBase64URL.fromBuffer(credential.publicKey),
			counter: credential.counter,
			transports: JSON.stringify(credential.transports || []),
			name: (name || '').slice(0, 64)
		}).returning().get();

		return { passkeyId };
	},

	async loginOptions(c) {

		const { rpID } = rpInfo(c);

		const options = await generateAuthenticationOptions({
			rpID,
			userVerification: 'preferred'
		});

		const challengeId = uuidv4();

		await c.env.kv.put(KvConst.PASSKEY_CHALLENGE + 'auth:' + challengeId, options.challenge, { expirationTtl: CHALLENGE_TTL });

		return { options, challengeId };
	},

	async loginVerify(c, params) {

		const { response, challengeId } = params;

		if (!response || !challengeId) {
			throw new BizError(t('passkeyVerifyFail'));
		}

		const key = KvConst.PASSKEY_CHALLENGE + 'auth:' + challengeId;
		const challenge = await c.env.kv.get(key);
		await c.env.kv.delete(key);

		if (!challenge) {
			throw new BizError(t('passkeyChallengeExpired'));
		}

		const row = await this.selectByCredentialId(c, response.id);

		if (!row) {
			throw new BizError(t('passkeyNotFound'));
		}

		const userRow = await userService.selectById(c, row.userId);

		if (!userRow) {
			throw new BizError(t('notExistUser'));
		}

		if (userRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}

		if (userRow.status === userConst.status.BAN) {
			throw new BizError(t('isBanUser'));
		}

		const credential = {
			id: row.credentialId,
			publicKey: isoBase64URL.toBuffer(row.publicKey),
			counter: row.counter,
			transports: safeTransports(row.transports)
		};

		const { rpID, origin } = rpInfo(c);

		let verification;

		try {
			verification = await verifyAuthenticationResponse({
				response,
				expectedChallenge: challenge,
				expectedOrigin: origin,
				expectedRPID: rpID,
				credential,
				requireUserVerification: false
			});
		} catch (e) {
			console.warn('passkey login verify fail:', e.message);
			throw new BizError(t('passkeyVerifyFail'));
		}

		if (!verification.verified) {
			throw new BizError(t('passkeyVerifyFail'));
		}

		await orm(c).update(passkey)
			.set({ counter: verification.authenticationInfo.newCounter, lastUsedTime: new Date().toISOString() })
			.where(eq(passkey.passkeyId, row.passkeyId))
			.run();

		return await loginService.login(c, { email: userRow.email, password: null }, true);
	},

	async remove(c, userId, passkeyId) {

		const row = await orm(c).select().from(passkey)
			.where(and(eq(passkey.passkeyId, Number(passkeyId)), eq(passkey.isDel, isDel.NORMAL)))
			.get();

		if (!row) {
			throw new BizError(t('passkeyNotFound'));
		}

		if (row.userId !== userId) {
			throw new BizError(t('passkeyNotYours'), 403);
		}

		await orm(c).delete(passkey).where(eq(passkey.passkeyId, row.passkeyId)).run();
	}

};

function safeTransports(transports) {
	try {
		const arr = JSON.parse(transports || '[]');
		return Array.isArray(arr) ? arr : [];
	} catch (e) {
		return [];
	}
}

export default passkeyService;

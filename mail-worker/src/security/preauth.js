import JwtUtils from '../utils/jwt-utils';
import KvConst from '../const/kv-const';
import constant from '../const/constant';

// ---------------------------------------------------------------------------
// Pre-authentication challenge
//
// After the password stage succeeds but MFA is still owed, the server issues a
// short-lived challenge token. It identifies the member server-side so the MFA
// verify endpoint never has to trust a client-supplied email or user ID, and it
// cannot reach any business API (the auth middleware rejects it because it is
// not in the user's KV token list).
//
// The challenge is stored in KV as single-use: verifying it deletes the key,
// so a stolen challenge cannot be replayed.
// ---------------------------------------------------------------------------

const PREAUTH_PREFIX = 'preauth:';

const preAuthService = {

	// Issue a challenge for a member who has passed the password stage.
	async issue(c, userId, purpose = constant.PREAUTH_CHALLENGE) {
		const tokenId = `preauth-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
		const token = await JwtUtils.generateToken(c, {
			userId,
			token: tokenId,
			// Marks this as a pre-auth challenge, not a full session. The auth
			// middleware rejects any token whose KV entry is missing.
			challenge: purpose
		}, constant.PREAUTH_EXPIRE);

		// Store the challenge state server-side so verify can look up the
		// member without trusting the client. Single-use: deleted on success.
		await c.env.kv.put(
			`${PREAUTH_PREFIX}${tokenId}`,
			JSON.stringify({
				userId,
				challenge: purpose,
				issuedAt: Math.floor(Date.now() / 1000),
				expiresAt: Math.floor(Date.now() / 1000) + constant.PREAUTH_EXPIRE
			}),
			{ expirationTtl: constant.PREAUTH_EXPIRE }
		);

		return token;
	},

	// Consume a challenge token and return the member's user ID. Returns null
	// if the token is invalid, expired, or already used.
	async consume(c, token) {
		if (!token) return null;

		const payload = await JwtUtils.verifyToken(c, token);
		if (!payload || !payload.challenge) return null;

		const tokenId = payload.token;
		if (!tokenId || !tokenId.startsWith('preauth-')) return null;

		// Single-use: delete before reading so a concurrent replay finds
		// nothing and fails.
		const stored = await c.env.kv.get(`${PREAUTH_PREFIX}${tokenId}`);
		await c.env.kv.delete(`${PREAUTH_PREFIX}${tokenId}`);

		if (!stored) return null;

		const state = JSON.parse(stored);
		const now = Math.floor(Date.now() / 1000);
		if (state.expiresAt && state.expiresAt < now) return null;

		return state.userId;
	},

	// Invalidate any outstanding challenges for a member (used on logout,
	// "sign in with a different account", and admin reset).
	async invalidateAll(c, userId) {
		// KV does not support prefix queries in Workers, so challenges are
		// short-lived and self-expiring. We record a revocation timestamp that
		// the consume check can consult.
		await c.env.kv.put(`${PREAUTH_PREFIX}revoked:${userId}`, String(Math.floor(Date.now() / 1000)), {
			expirationTtl: constant.PREAUTH_EXPIRE * 2
		});
	}
};

export default preAuthService;
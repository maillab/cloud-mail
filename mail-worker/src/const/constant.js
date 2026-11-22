const constant = {
	TOKEN_HEADER: 'Authorization',
	JWT_UID: 'user_id:',
	JWT_TOKEN: 'token:',
	TOKEN_EXPIRE: 60 * 60 * 24 * 30,
	// Pre-authentication challenge: issued after the password stage succeeds
	// but before MFA is verified. Short-lived (5 min), single-use, and cannot
	// reach any business API. It carries only the user identity so the MFA
	// verify endpoint never needs the email/password again.
	PREAUTH_EXPIRE: 60 * 5,
	PREAUTH_CHALLENGE: 'mfa',
	ATTACHMENT_PREFIX: 'attachments/',
	BACKGROUND_PREFIX: 'static/background/',
	ADMIN_ROLE: {
		name: 'admin',
		sendCount: 0,
		sendType: 'count',
		accountCount: 0
	}
}

export default constant

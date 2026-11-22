import http from '@/axios/index.js';

export function login(email, password, extra = {}) {
    return http.post('/login', {email: email, password: password, ...extra})
}

// MFA verify: consumes a pre-auth challenge token (issued by /login after the
// password stage) plus a TOTP code or recovery code. The member's identity is
// derived from the challenge server-side, so the client never re-sends the
// email or password.
export function verifyMfa({preAuthToken, code, recoveryCode}) {
    return http.post('/auth/mfa/verify', {preAuthToken, code, recoveryCode})
}

export function logout() {
    return http.delete('/logout')
}

export function register(form) {
    return http.post('/register', form)
}
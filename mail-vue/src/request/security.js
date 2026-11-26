import http from '@/axios/index.js'

export function login(email, password, extra = {}) {
    return http.post('/login', {email: email, password: password, ...extra})
}

export function logout() {
    return http.delete('/logout')
}

export function register(form) {
    return http.post('/register', form)
}

// ---------------------------------------------------------------------------
// Security and onboarding
// ---------------------------------------------------------------------------

export function securityState() {
    return http.get('/security/state')
}

export function onboardingState() {
    return http.get('/security/onboarding/state')
}

export function onboardingChangePassword(currentPassword, newPassword) {
    return http.post('/security/onboarding/password', {currentPassword, newPassword})
}

export function onboardingFinish() {
    return http.post('/security/onboarding/finish')
}

export function mfaSetup() {
    return http.post('/security/mfa/setup')
}

export function mfaConfirm(code) {
    return http.post('/security/mfa/confirm', {code})
}

export function mfaRemove(code) {
    return http.post('/security/mfa/remove', {code})
}

export function mfaRegenerateRecoveryCodes(code) {
    return http.post('/security/mfa/recovery/regenerate', {code})
}

export function changePassword(currentPassword, newPassword) {
    return http.put('/security/password', {currentPassword, newPassword})
}

export function listSessions() {
    return http.get('/security/sessions')
}

export function revokeSession(id) {
    return http.delete(`/security/sessions/${id}`)
}

export function revokeOtherSessions() {
    return http.delete('/security/sessions')
}

export function loginHistory(limit = 50) {
    return http.get('/security/login-history', {params: {limit}})
}

export function resetMemberMfa(userId, reason, stepUpCode, forcePasswordChange) {
    return http.post('/user/resetMfa', { userId, reason, stepUpCode, forcePasswordChange })
}

export function resetMemberPassword(userId, password) {
    // If no password is provided, the backend generates a secure random one.
    return http.post('/user/resetPassword', { userId, password })
}

export function memberSecurity(userId) {
    return http.get(`/user/${userId}/security`)
}

// Aliases used by the member-security drawer.
export const userSecurityGet = memberSecurity
export const userResetMfa = resetMemberMfa
export const userResetPassword = resetMemberPassword
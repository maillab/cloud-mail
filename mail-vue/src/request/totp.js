import http from '@/axios/index.js';

export function totpEnroll() {
    return http.post('/totp/enroll')
}

export function totpConfirm(code) {
    return http.post('/totp/confirm', { code })
}

export function totpDisable() {
    return http.post('/totp/disable')
}

export function totpStatus() {
    return http.get('/totp/status')
}

export function totpRegenRecoveryCodes() {
    return http.post('/totp/recovery-codes')
}

export function totpVerifyLogin(preAuthToken, code, recoveryCode) {
    return http.post('/login/totp', { preAuthToken, code, recoveryCode })
}

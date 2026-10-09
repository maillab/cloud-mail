import http from '@/axios/index.js';

export function passkeyRegisterOptions() {
    return http.post('/passkey/register/options')
}

export function passkeyRegisterVerify(response, name) {
    return http.post('/passkey/register/verify', {response, name})
}

export function passkeyLoginOptions() {
    return http.post('/passkey/login/options')
}

export function passkeyLoginVerify(response, challengeId) {
    return http.post('/passkey/login/verify', {response, challengeId})
}

export function passkeyList() {
    return http.get('/passkey/list')
}

export function passkeyDelete(passkeyId) {
    return http.delete(`/passkey/${passkeyId}`)
}

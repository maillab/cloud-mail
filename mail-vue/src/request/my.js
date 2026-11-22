import http from '@/axios/index.js';

export function loginUserInfo(config = {}) {
    return http.get('/my/loginUserInfo', config)
}

export function resetPassword(password) {
    return http.put('/my/resetPassword', {password})
}

export function updateSignature(params) {
    return http.put('/my/signature', params)
}

export function userDelete() {
    return http.delete('/my/delete')
}

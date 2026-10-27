import http from '@/axios/index.js';

export function loginUserInfo() {
    return http.get('/my/loginUserInfo')
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

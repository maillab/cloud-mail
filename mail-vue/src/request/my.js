import http from '@/axios/index.js';

export function loginUserInfo() {
    return http.get('/my/loginUserInfo')
}

export function resetPassword(currentPassword, password) {
    return http.put('/my/resetPassword', {currentPassword, password})
}

export function updateAvatar(avatar) {
    return http.put('/my/avatar', {avatar})
}

export function verifyPassword(password) {
    return http.post('/verify-password', {password})
}

export function userDelete() {
    return http.delete('/my/delete')
}


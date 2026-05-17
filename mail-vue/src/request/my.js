import http from '@/axios/index.js';

export function loginUserInfo() {
    return http.get('/my/loginUserInfo')
}

export function resetPassword(password) {
    return http.put('/my/resetPassword', {password})
}

export function userDelete() {
    return http.delete('/my/delete')
}

export function uploadAvatar(file) {
    const form = new FormData()
    form.append('file', file)
    return http.put('/my/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export function deleteAvatar() {
    return http.delete('/my/avatar')
}


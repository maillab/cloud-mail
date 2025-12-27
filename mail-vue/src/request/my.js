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

export function setEmailAutoDeleteDays(days) {
    return http.put('/my/setEmailAutoDeleteDays', { days })
}

export function unbindGithub() {
    return http.delete('/oauth/unbindGithub')
}


import http from '@/axios/index.js'

export function forwardList() {
    return http.get('/forward/list');
}

export function forwardAdd(targetEmail) {
    return http.post('/forward/add', {targetEmail})
}

export function forwardVerify(forwardId, code) {
    return http.post('/forward/verify', {forwardId, code})
}

export function forwardResendCode(forwardId) {
    return http.post('/forward/resendCode', {forwardId})
}

export function forwardSetStatus(forwardId, status) {
    return http.put('/forward/setStatus', {forwardId, status})
}

export function forwardDelete(forwardId) {
    return http.delete('/forward/delete', {params: {forwardId}})
}

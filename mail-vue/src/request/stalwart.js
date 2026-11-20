import http from '@/axios/index.js'

export function stalwartGet(accountId) {
    return http.get('/account/stalwart', {params: {accountId}})
}

export function stalwartSave(data) {
    return http.put('/account/stalwart', data)
}

export function stalwartRetry(accountId) {
    return http.post('/account/stalwart/retry', {accountId})
}

import http from '@/axios/index.js';

export function claimAccounts(emailId) {
    return http.get('/allEmail/claimAccounts', {params: {emailId}})
}

export function claimEmail(emailId, accountId) {
    return http.post('/allEmail/claim', {emailId, accountId})
}

export function allEmailList(params) {
    return http.get('/allEmail/list', {params: {...params}})
}

export function allEmailDelete(emailIds) {
    return http.delete('/allEmail/delete?emailIds=' + emailIds)
}

export function allEmailBatchDelete(params) {
    return http.delete('/allEmail/batchDelete', {params: params} )
}

export function allEmailLatest(emailId) {
    return http.get('/allEmail/latest', {params: {emailId}, noMsg: true, timeout: 35 * 1000})
}

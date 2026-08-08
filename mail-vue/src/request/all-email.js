import http from '@/axios/index.js';
import {normalizePageSize} from '@/request/params.js'

export function allEmailList(params = {}) {
    return http.get('/allEmail/list', {
        params: {
            ...params,
            size: normalizePageSize(params.size, 50, 20),
        }
    })
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

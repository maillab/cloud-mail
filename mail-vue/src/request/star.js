import http from "@/axios/index.js";
import {normalizePageSize} from '@/request/params.js'

export function starAdd(emailId) {
    return http.post('/star/add', {emailId})
}

export function starCancel(emailId) {
    return http.delete('/star/cancel', {params: {emailId}})
}

export function starList(emailId, size) {
    const params = {size: normalizePageSize(size, 50, 20)}
    // First page intentionally omits the zero cursor.
    if (Number(emailId) > 0) params.emailId = emailId
    return http.get('/star/list', {params})
}

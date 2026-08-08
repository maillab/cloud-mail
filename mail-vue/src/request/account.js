import http from '@/axios/index.js'
import {normalizePageSize} from '@/request/params.js'

export function accountList(accountId, size, lastSort) {
    return http.get('/account/list', {
        params: {accountId, size: normalizePageSize(size, 30, 20), lastSort}
    });
}

export function accountAdd(email,token) {
    return http.post('/account/add', {email,token})
}

export function accountSetName(accountId,name) {
    return http.put('/account/setName', {name,accountId})
}

export function accountDelete(accountId) {
    return http.delete('/account/delete', {params: {accountId}})
}

export function accountSetAllReceive(accountId) {
    return http.put('/account/setAllReceive', {accountId})
}

export function accountSetAsTop(accountId) {
    return http.put('/account/setAsTop', {accountId})
}

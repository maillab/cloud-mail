import http from '@/axios/index.js';

export function emailList(accountId, allReceive, emailId, timeSort, size, type, full, searchParams = {}) {
    const {type: searchType, text, startDate, endDate, folderKey, customFolderId, unreadOnly, starredOnly, hasAttachments} = searchParams
    return http.get('/email/list', {params: {accountId, allReceive, emailId, timeSort, size, type, full, searchType, text, startDate, endDate, folderKey, customFolderId, unreadOnly, starredOnly, hasAttachments}})
}

export function emailDelete(emailIds, permanent = false) {
    const ids = Array.isArray(emailIds) ? emailIds.join(',') : emailIds
    return http.delete('/email/delete', {params: {emailIds: ids, permanent}})
}

export function emailLatest(emailId, accountId, allReceive) {
    return http.get('/email/latest', {params: {emailId, accountId, allReceive}, noMsg: true, timeout: 35 * 1000})
}

export function emailRead(emailIds) {
    return http.put('/email/read', {emailIds})
}

export function emailSend(form,progress) {
    return http.post('/email/send', form,{
        onUploadProgress: (e) => {
            progress(e)
        },
        noMsg: true
    })
}

import http from '@/axios/index.js'

export function directoryList(params) {
    return http.get('/directory', { params });
}
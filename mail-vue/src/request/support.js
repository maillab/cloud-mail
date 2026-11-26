import http from '@/axios/index.js'

export function supportList(params) {
    return http.get('/support', { params });
}

export function supportCreate(data) {
    return http.post('/support', data);
}

export function supportUpdate(id, data) {
    return http.put(`/support/${id}`, data);
}

export function supportDelete(id) {
    return http.delete(`/support/${id}`);
}

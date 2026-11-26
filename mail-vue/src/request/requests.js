import http from '@/axios/index.js'

export function requestList(params) {
    return http.get('/requests', { params });
}

export function requestGet(id) {
    return http.get(`/requests/${id}`);
}

export function requestCreate(data) {
    return http.post('/requests', data);
}

export function requestAct(id, data) {
    return http.post(`/requests/${id}/act`, data);
}

export function requestComment(id, data) {
    return http.post(`/requests/${id}/events`, data);
}
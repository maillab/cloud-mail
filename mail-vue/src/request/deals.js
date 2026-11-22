import http from '@/axios/index.js'

export function dealsList(params) {
    return http.get('/crm/deals', { params });
}

export function dealsCreate(data) {
    return http.post('/crm/deals', data);
}

export function dealsUpdate(id, data) {
    return http.put(`/crm/deals/${id}`, data);
}

export function dealsDelete(id) {
    return http.delete(`/crm/deals/${id}`);
}

import http from '@/axios/index.js'

export function stagesList(params) {
    return http.get('/crm/stages', { params });
}

export function stagesCreate(data) {
    return http.post('/crm/stages', data);
}

export function stagesUpdate(id, data) {
    return http.put(`/crm/stages/${id}`, data);
}

export function stagesDelete(id) {
    return http.delete(`/crm/stages/${id}`);
}

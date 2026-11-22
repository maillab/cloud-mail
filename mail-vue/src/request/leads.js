import http from '@/axios/index.js'

export function leadsList(params) {
    return http.get('/crm/leads', { params });
}

export function leadsCreate(data) {
    return http.post('/crm/leads', data);
}

export function leadsUpdate(id, data) {
    return http.put(`/crm/leads/${id}`, data);
}

export function leadsAssign(id, assignee_id) {
    return http.put(`/crm/leads/${id}/assignee`, { assignee_id });
}

export function leadsDelete(id) {
    return http.delete(`/crm/leads/${id}`);
}

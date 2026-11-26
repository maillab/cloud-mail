import http from '@/axios/index.js'

export function organizationsList(params) {
    return http.get('/crm/organizations', { params });
}

export function organizationsGet(id) {
    return http.get(`/crm/organizations/${id}`);
}

export function organizationsCreate(data) {
    return http.post('/crm/organizations', data);
}

export function organizationsUpdate(id, data) {
    return http.put(`/crm/organizations/${id}`, data);
}

export function organizationsDelete(id) {
    return http.delete(`/crm/organizations/${id}`);
}

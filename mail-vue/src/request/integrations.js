import http from '@/axios/index.js'

export function integrationsList() {
    return http.get('/integrations');
}

export function integrationsCreate(data) {
    return http.post('/integrations', data);
}

export function integrationsUpdate(id, data) {
    return http.put(`/integrations/${id}`, data);
}

export function integrationsDelete(id) {
    return http.delete(`/integrations/${id}`);
}
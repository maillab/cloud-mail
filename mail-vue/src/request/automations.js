import http from '@/axios/index.js'

export function automationsList() {
    return http.get('/automations');
}

export function automationsCreate(data) {
    return http.post('/automations', data);
}

export function automationsUpdate(id, data) {
    return http.put(`/automations/${id}`, data);
}

export function automationsDelete(id) {
    return http.delete(`/automations/${id}`);
}
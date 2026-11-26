import http from '@/axios/index.js'

export function contactOrganizationsList(params) {
    return http.get('/crm/contact-organizations', { params });
}

export function contactOrganizationsCreate(data) {
    return http.post('/crm/contact-organizations', data);
}

export function contactOrganizationsUpdate(id, data) {
    return http.put(`/crm/contact-organizations/${id}`, data);
}

export function contactOrganizationsDelete(id) {
    return http.delete(`/crm/contact-organizations/${id}`);
}

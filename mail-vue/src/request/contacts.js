import http from '@/axios/index.js'

export function contactsList(params) {
    return http.get('/crm/contacts', { params });
}

export function contactsGet(id) {
    return http.get(`/crm/contacts/${id}`);
}

export function contactsCreate(data) {
    return http.post('/crm/contacts', data);
}

export function contactsUpdate(id, data) {
    return http.put(`/crm/contacts/${id}`, data);
}

export function contactsAssign(id, assignee_id) {
    return http.put(`/crm/contacts/${id}/assignee`, { assignee_id });
}

export function contactsDelete(id) {
    return http.delete(`/crm/contacts/${id}`);
}

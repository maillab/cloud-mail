import http from '@/axios/index.js'

export function companiesList(params) {
    return http.get('/crm/companies', { params });
}

export function companiesCreate(data) {
    return http.post('/crm/companies', data);
}

export function companiesUpdate(id, data) {
    return http.put(`/crm/companies/${id}`, data);
}

export function companiesDelete(id) {
    return http.delete(`/crm/companies/${id}`);
}

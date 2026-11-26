import http from '@/axios/index.js'

export function activitiesList(params) {
    return http.get('/crm/activities', { params });
}

export function activitiesCreate(data) {
    return http.post('/crm/activities', data);
}

export function activitiesDelete(id) {
    return http.delete(`/crm/activities/${id}`);
}

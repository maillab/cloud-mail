import http from '@/axios/index.js'

export function peopleList(params) {
    return http.get('/people', { params });
}

export function peopleCreate(data) {
    return http.post('/people', data);
}

export function peopleUpdate(id, data) {
    return http.put(`/people/${id}`, data);
}

export function peopleDelete(id) {
    return http.delete(`/people/${id}`);
}

import http from '@/axios/index.js'

export function projectsList(params) {
    return http.get('/projects', { params });
}

export function projectsCreate(data) {
    return http.post('/projects', data);
}

export function projectsUpdate(id, data) {
    return http.put(`/projects/${id}`, data);
}

export function projectsDelete(id) {
    return http.delete(`/projects/${id}`);
}

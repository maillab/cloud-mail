import http from '@/axios/index.js'

export function tasksList(params) {
    return http.get('/crm/tasks', { params });
}

export function tasksCreate(data) {
    return http.post('/crm/tasks', data);
}

export function tasksUpdate(id, data) {
    return http.put(`/crm/tasks/${id}`, data);
}

export function tasksDelete(id) {
    return http.delete(`/crm/tasks/${id}`);
}

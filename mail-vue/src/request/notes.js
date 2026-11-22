import http from '@/axios/index.js'

export function notesList(params) {
    return http.get('/notes', { params });
}

export function notesCreate(data) {
    return http.post('/notes', data);
}

export function notesUpdate(id, data) {
    return http.put(`/notes/${id}`, data);
}

export function notesDelete(id) {
    return http.delete(`/notes/${id}`);
}

export function notesPin(id, isPinned) {
    return http.post(`/notes/${id}/pin`, { is_pinned: isPinned });
}

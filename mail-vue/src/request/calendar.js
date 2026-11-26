import http from '@/axios/index.js'

export function calendarList(params) {
    return http.get('/calendar', { params });
}

export function calendarGet(id) {
    return http.get(`/calendar/${id}`);
}

export function calendarCreate(data) {
    return http.post('/calendar', data);
}

export function calendarUpdate(id, data) {
    return http.put(`/calendar/${id}`, data);
}

export function calendarDelete(id) {
    return http.delete(`/calendar/${id}`);
}

export function calendarAddParticipants(id, userIds) {
    return http.post(`/calendar/${id}/participants`, { user_ids: userIds });
}

export function calendarRespond(id, response) {
    return http.post(`/calendar/${id}/respond`, { response });
}
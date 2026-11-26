import http from '@/axios/index.js'

export function notificationsList(params) {
    return http.get('/notifications', { params });
}

export function notificationsCreate(data) {
    return http.post('/notifications', data);
}

export function notificationsMarkRead(id) {
    return http.put(`/notifications/${id}/read`);
}

export function notificationsMarkReadAll() {
    return http.put('/notifications/read-all');
}

export function notificationsDelete(id) {
    return http.delete(`/notifications/${id}`);
}

// Per-member notification channel preferences. Security notifications are
// always on and cannot be disabled by the server.
export function notificationsPreferencesGet() {
    return http.get('/notifications/preferences');
}

export function notificationsPreferencesSet(data) {
    return http.put('/notifications/preferences', data);
}

export function notificationsPreferencesReset() {
    return http.post('/notifications/preferences/reset');
}

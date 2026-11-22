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

// Tutorial progress + preferences (showOnFirstVisit / showGuideButton).
export function tutorialsGet() {
    return http.get('/tutorials');
}

export function tutorialsPreferencesSet(data) {
    return http.put('/tutorials/preferences', data);
}

export function tutorialsComplete(tourId, version) {
    return http.post(`/tutorials/${tourId}/complete`, { version });
}

export function tutorialsDismiss(tourId, version) {
    return http.post(`/tutorials/${tourId}/dismiss`, { version });
}

export function tutorialsReset(tourId) {
    return http.delete('/tutorials/progress', { params: tourId ? { tourId } : {} });
}

// Guide state: acknowledge the current effective-access version (so an access
// change is announced once) and mark the first-workspace tour complete.
export function tutorialsAccessAck(data) {
    return http.post('/tutorials/access/ack', data);
}

export function tutorialsFirstComplete() {
    return http.post('/tutorials/first-complete', {});
}

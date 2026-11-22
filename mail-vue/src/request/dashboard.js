import http from '@/axios/index.js'

export function getPreferences() {
    return http.get('/dashboard/preferences');
}

export function savePreferences(data) {
    return http.put('/dashboard/preferences', data);
}

export function resetPreferences() {
    return http.post('/dashboard/preferences/reset');
}

export function markOnboarded() {
    return http.post('/dashboard/preferences/onboard');
}
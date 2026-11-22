import http from '@/axios/index.js'

export function aiStatus() {
    return http.get('/ai/status');
}

export function aiSuggestionsList() {
    return http.get('/ai/suggestions');
}

export function aiSuggest(data) {
    return http.post('/ai/suggest', data);
}

export function aiAccept(id) {
    return http.put(`/ai/suggestions/${id}/accept`);
}
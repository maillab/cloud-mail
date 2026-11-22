import http from '@/axios/index.js'

export function whatsappConversationsList(params) {
    return http.get('/whatsapp/conversations', { params });
}

export function whatsappMessagesList(conversationId, params) {
    return http.get(`/whatsapp/messages/${conversationId}`, { params });
}

export function whatsappSuggest(data) {
    return http.post('/whatsapp/suggest', data);
}

export function whatsappSend(data) {
    return http.post('/whatsapp/send', data);
}
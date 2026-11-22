import http from '@/axios/index.js'

// Connections: a fixed catalogue of the services XPass HQ actually integrates
// with (WhatsApp Business, XPass AI, email notifications). There is no
// free-form "new integration" form on purpose -- a connection that does not
// exist is worse than a missing entry. Credentials are written here and never
// read back; only their configured/connected state is ever returned.

export function connectionsOverview() {
    return http.get('/connections');
}

export function connectionsGet(provider) {
    return http.get(`/connections/${provider}`);
}

export function connectionsSave(provider, data) {
    return http.put(`/connections/${provider}`, data);
}

export function connectionsDisconnect(provider) {
    return http.delete(`/connections/${provider}`);
}

export function connectionsVerify(provider, data) {
    return http.post(`/connections/${provider}/verify`, data);
}

export function connectionsError(provider, data) {
    return http.post(`/connections/${provider}/error`, data);
}
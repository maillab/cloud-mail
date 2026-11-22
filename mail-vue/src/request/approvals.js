import http from '@/axios/index.js'

export function approvalList(params) {
    return http.get('/approvals', { params });
}

export function approvalGet(id) {
    return http.get(`/approvals/${id}`);
}

export function approvalCreate(data) {
    return http.post('/approvals', data);
}

export function approvalSubmit(id) {
    return http.post(`/approvals/${id}/submit`);
}

export function approvalApprove(id, data) {
    return http.post(`/approvals/${id}/approve`, data);
}

export function approvalReject(id, data) {
    return http.post(`/approvals/${id}/reject`, data);
}

export function approvalRequestChanges(id, data) {
    return http.post(`/approvals/${id}/request-changes`, data);
}

export function approvalCancel(id) {
    return http.post(`/approvals/${id}/cancel`);
}

export function approvalComment(id, data) {
    return http.post(`/approvals/${id}/comments`, data);
}
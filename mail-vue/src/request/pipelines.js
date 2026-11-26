import http from '@/axios/index.js'

export function pipelinesList(params) {
    return http.get('/crm/pipelines', { params });
}

export function pipelinesCreate(data) {
    return http.post('/crm/pipelines', data);
}

export function pipelinesUpdate(id, data) {
    return http.put(`/crm/pipelines/${id}`, data);
}

export function pipelinesDelete(id) {
    return http.delete(`/crm/pipelines/${id}`);
}

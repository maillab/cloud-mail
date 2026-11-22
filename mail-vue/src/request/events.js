import http from '@/axios/index.js'

export function eventsList(params) {
    return http.get('/crm/events', { params });
}

export function eventsCreate(data) {
    return http.post('/crm/events', data);
}

export function eventsUpdate(id, data) {
    return http.put(`/crm/events/${id}`, data);
}

export function eventsDelete(id) {
    return http.delete(`/crm/events/${id}`);
}

export function eventsImport(events) {
    return http.post('/crm/events/import', { events });
}

export function eventsDiscover(candidates) {
    return http.post('/crm/events/discover', { candidates });
}

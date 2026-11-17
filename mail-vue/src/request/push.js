import http from '@/axios/index.js';

export function pushPublicKey() {
    return http.get('/push/publicKey')
}

export function pushSubscribe(subscription, config = {}) {
    return http.post('/push/subscribe', subscription, config)
}

export function pushUnsubscribe(endpoint, config = {}) {
    return http.post('/push/unsubscribe', {endpoint}, config)
}

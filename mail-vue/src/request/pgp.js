import http from '@/axios/index.js';

export function pgpKeyStatus(email) {
    return http.get('/pgp/key-status', {params: {email}, noMsg: true})
}

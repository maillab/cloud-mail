import http from '@/axios/index.js';

export function oauthLinuxDoLogin(code) {
    return http.post('/oauth/linuxDo/login',{code})
}

export function oauthGithubLogin(code) {
    return http.post('/oauth/github/login',{code})
}

export function oauthBindUser(form) {
    return http.put('/oauth/bindUser', form)
}

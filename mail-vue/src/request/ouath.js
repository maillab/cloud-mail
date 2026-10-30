import http from '@/axios/index.js';

export function oauthLinuxDoLogin(code, redirectUri) {
    return http.post('/oauth/linuxDo/login',{code, redirectUri})
}

export function oauthGithubLogin(code, redirectUri) {
    return http.post('/oauth/github/login',{code, redirectUri})
}

export function oauthGoogleLogin(code, redirectUri) {
    return http.post('/oauth/google/login',{code, redirectUri})
}

export function oauthBindUser(form) {
    return http.put('/oauth/bindUser', form)
}

export function oauthBindCurrentUser(form) {
    return http.put('/oauth/bindCurrent', form)
}

export function oauthUnbind(platform) {
    return http.delete('/oauth/unbind?platform=' + platform)
}

export function oauthBindings() {
    return http.get('/oauth/bindings')
}

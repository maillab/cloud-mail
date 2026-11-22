import http from '@/axios/index.js'

export function identityGet() {
    return http.get('/user/identity');
}

export function identityUpdate(data) {
    return http.put('/user/profile', data);
}

export function avatarUpload(dataUrl) {
    return http.post('/user/avatar', {avatar: dataUrl});
}

export function avatarRemove() {
    return http.delete('/user/avatar');
}

export function accessPreview(userId) {
    return http.get('/user/access', { params: userId ? { userId } : {} });
}

// Write side of the individual-member access model: grant, deny or clear direct
// per-member permission overrides. effect is 'allow' | 'deny' | 'inherit'.
export function setMemberAccess(userId, permKeys, effect) {
    return http.put('/user/access', { userId, permKeys, effect });
}

export function heartbeat() {
    return http.post('/user/presence');
}

export function directoryList(params) {
    return http.get('/user/directory', {params});
}

export function teamList(params) {
    return http.get('/setting/teams', {params});
}

export function teamCreate(data) {
    return http.post('/setting/team', data);
}

export function teamUpdate(id, data) {
    return http.put(`/setting/team/${id}`, data);
}

export function teamArchive(id) {
    return http.delete(`/setting/team/${id}`);
}
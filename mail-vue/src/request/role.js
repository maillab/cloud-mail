import http from '@/axios/index.js';

export function roleAdd(params) {
    return http.post('/role/add',params)
}

export function rolePermTree() {
    return http.get('/role/tree')
}

export function roleRoleList() {
    return http.get('/role/list')
}

export function roleSet(params) {
    return http.put('/role/set',params)
}

export function roleDelete(roleId) {
    return http.delete('/role/delete',{params:{roleId}})
}

export function roleSetDef(roleId) {
    return http.put('/role/setDefault',{roleId})
}


export function roleSelectUse() {
    return http.get('/role/selectUse')
}


export async function roleSelectUseCompat() {
    try {
        const list = await http.get('/role/selectUse', {noMsg: true})
        if (Array.isArray(list) && list.length) return list
    } catch (_) {
        // Older/self-hosted deployments may gate selectUse differently.
    }

    const roles = await http.get('/role/list', {noMsg: true})
    if (!Array.isArray(roles)) return []
    return roles
        .filter(item => Number(item?.roleId) > 0)
        .map(item => ({
            name: item.name || '未命名角色',
            roleId: Number(item.roleId),
            isDefault: Number(item.isDefault || 0),
        }))
}

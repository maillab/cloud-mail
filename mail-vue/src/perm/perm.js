import {useUserStore} from "@/store/user.js";

export default {
    mounted(el, binding) {
        const userStore = useUserStore();
        const permKeys = userStore.user.permKeys;
        const value = binding.value;

        if (permKeys.includes('*')) {
            return;
        }

        const hasPermission = Array.isArray(value)
            ? value.some(key => permKeys.includes(key))
            : permKeys.includes(value);

        if (!hasPermission) {
            el.parentNode && el.parentNode.removeChild(el);
        }
    }
}

export function hasPerm(permKey) {
    const {permKeys} = useUserStore().user;
    return permKeys.includes('*') || permKeys.includes(permKey);
}


export function permsToRouter(permKeys) {
    const routerList = []
    Object.keys(routers).forEach(perm => {
        if (permKeys.includes(perm) || permKeys.includes('*')) {
            routerList.push(...routers[perm])
        }
    })
    return routerList;
}

const routers = {
    'email:send': [
        {
            path: '/sent',
            name: 'send',
            component: () => import('@/views/send/index.vue'),
            meta: {
                title: 'sent',
                name: 'send',
                menu: true
            }
        },
        {
            path: '/drafts',
            name: 'draft',
            component: () => import('@/views/draft/index.vue'),
            meta: {
                title: 'drafts',
                name: 'draft',
                menu: true
            }
        }
    ],
    'user:query': [{
        path: '/all-users',
        name: 'user',
        component: () => import('@/views/user/index.vue'),
        meta: {
            title: 'allUsers',
            name: 'user',
            menu: true
        }
    }],
    'role:query': [{
        path: '/role',
        name: 'role',
        component: () => import('@/views/role/index.vue'),
        meta: {
            title: 'permissions',
            name: 'role',
            menu: true
        }
    }],
    'setting:query': [{
        path: '/system-settings',
        name: 'sys-setting',
        component: () => import('@/views/sys-setting/index.vue'),
        meta: {
            title: 'SystemSettings',
            name: 'sys-setting',
            menu: true
        }
    }],
    'reg-key:query': [{
        path: '/invite-code',
        name: 'reg-key',
        component: () => import('@/views/reg-key/index.vue'),
        meta: {
            title: 'inviteCode',
            name: 'reg-key',
            menu: true
        }
    }],
    'all-email:query': [{
        path: '/all-mail',
        name: 'all-email',
        component: () => import('@/views/all-email/index.vue'),
        meta: {
            title: 'allMail',
            name: 'all-email',
            menu: true
        }
    }],
    'analysis:query': [{
        path: '/dashboard',
        name: 'analysis',
        component: () => import('@/views/analysis/index.vue'),
        meta: {
            title: 'analytics',
            name: 'analysis',
            menu: true
        }
    }]
}

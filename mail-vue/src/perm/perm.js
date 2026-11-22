import {useUserStore} from "@/store/user.js";

export default {
    mounted(el, binding) {
        const userStore = useUserStore();
        // Before login resolves, user is an empty object. Reading permKeys off
        // it and calling includes() threw, which took the component down with it.
        const permKeys = userStore.user?.permKeys || [];
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
    const permKeys = useUserStore().user?.permKeys || [];
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

export function requiredPermForPath(path) {
    let matched = null
    Object.keys(routers).forEach(perm => {
        routers[perm].forEach(r => {
            if ((path === r.path || path.startsWith(r.path + '/')) && (!matched || r.path.length > matched.length)) {
                matched = r.path
            }
        })
    })
    if (!matched) return null
    const entry = Object.keys(routers).find(perm => routers[perm].some(r => r.path === matched))
    return entry || null
}

const routers = {
    'email:send': [],
    // Shared inboxes are part of the mail workspace, so they are gated by the
    // mailbox permission and addressed by mailbox id. The route only exists
    // for members who may open mailboxes at all.
    'mailbox:query': [{
        path: '/mail/shared/:mailboxId',
        name: 'mail-shared-inbox',
        component: () => import('@/views/mail/shared-inbox.vue'),
        meta: {
            title: 'inbox',
            name: 'mail-shared-inbox',
            menu: false
        }
    }],
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
    }],
    'contacts:query': [{
        path: '/crm/contacts',
        name: 'crm-contacts',
        component: () => import('@/views/crm/index.vue'),
        meta: {
            title: 'crmContacts',
            name: 'crm-contacts',
            menu: true
        }
    }],
    'companies:query': [{
        path: '/crm/companies',
        name: 'crm-companies',
        component: () => import('@/views/crm/companies.vue'),
        meta: {
            title: 'crmCompanies',
            name: 'crm-companies',
            menu: true
        }
    }],
    'pipelines:query': [{
        path: '/crm/pipelines',
        name: 'crm-pipelines',
        component: () => import('@/views/crm/pipelines.vue'),
        meta: {
            title: 'crmPipelines',
            name: 'crm-pipelines',
            menu: true
        }
    }],
    'deals:query': [{
        path: '/crm/deals',
        name: 'crm-deals',
        component: () => import('@/views/crm/deals.vue'),
        meta: {
            title: 'crmDeals',
            name: 'crm-deals',
            menu: true
        }
    }],
    'tasks:query': [{
        path: '/crm/tasks',
        name: 'crm-tasks',
        component: () => import('@/views/crm/tasks.vue'),
        meta: {
            title: 'crmTasks',
            name: 'crm-tasks',
            menu: true
        }
    }],
    'leads:query': [{
        path: '/crm/leads',
        name: 'crm-leads',
        component: () => import('@/views/crm/leads.vue'),
        meta: {
            title: 'crmLeads',
            name: 'crm-leads',
            menu: true
        }
    }],
    'organizations:query': [{
        path: '/crm/organizations',
        name: 'crm-organizations',
        component: () => import('@/views/crm/organizations.vue'),
        meta: {
            title: 'crmOrganizations',
            name: 'crm-organizations',
            menu: true
        }
    }],
    'contact-organizations:query': [{
        path: '/crm/relationships',
        name: 'crm-relationships',
        component: () => import('@/views/crm/relationships.vue'),
        meta: {
            title: 'crmRelationships',
            name: 'crm-relationships',
            menu: true
        }
    }],
    'events:query': [{
        path: '/crm/events',
        name: 'crm-events',
        component: () => import('@/views/crm/events.vue'),
        meta: {
            title: 'crmEvents',
            name: 'crm-events',
            menu: true
        }
    }],
    'activities:query': [{
        path: '/crm/activities',
        name: 'crm-activities',
        component: () => import('@/views/crm/activities.vue'),
        meta: {
            title: 'crmActivities',
            name: 'crm-activities',
            menu: true
        }
    }],
    'projects:query': [{
        path: '/projects',
        name: 'projects',
        component: () => import('@/views/projects/index.vue'),
        meta: {
            title: 'projects',
            name: 'projects',
            menu: true
        }
    }],
    'calendar:query': [{
        path: '/calendar',
        name: 'calendar',
        component: () => import('@/views/calendar/index.vue'),
        meta: {
            title: 'calendar',
            name: 'calendar',
            menu: true
        }
    }],
    'notes:query': [{
        path: '/notes',
        name: 'notes',
        component: () => import('@/views/notes/index.vue'),
        meta: {
            title: 'notes',
            name: 'notes',
            menu: true
        }
    }],
    'people:query': [{
        path: '/people',
        name: 'people',
        component: () => import('@/views/people/index.vue'),
        meta: {
            title: 'people',
            name: 'people',
            menu: true
        }
    }],
    'support:query': [{
        path: '/support',
        name: 'support',
        component: () => import('@/views/support/index.vue'),
        meta: {
            title: 'support',
            name: 'support',
            menu: true
        }
    }],
    'approvals:query': [{
        path: '/approvals',
        name: 'approvals',
        component: () => import('@/views/approvals/index.vue'),
        meta: {
            title: 'approvals',
            name: 'approvals',
            menu: true
        }
    }],
    'requests:query': [{
        path: '/requests',
        name: 'requests',
        component: () => import('@/views/requests/index.vue'),
        meta: {
            title: 'internalRequests',
            name: 'requests',
            menu: true
        }
    }],
    'documents:query': [{
        path: '/documents',
        name: 'documents',
        component: () => import('@/views/documents/index.vue'),
        meta: {
            title: 'documents',
            name: 'documents',
            menu: true
        }
    }],
    'finance:view': [{
        path: '/finance',
        name: 'finance',
        component: () => import('@/views/finance/index.vue'),
        meta: {
            title: 'finance',
            name: 'finance',
            menu: true
        }
    }],
    'whatsapp:query': [{
        path: '/whatsapp',
        name: 'whatsapp',
        redirect: '/coming-soon/whatsapp',
        meta: {
            title: 'whatsapp',
            name: 'whatsapp',
            menu: true
        }
    }],
    'ai:use': [{
        path: '/ai',
        name: 'ai',
        redirect: '/overview',
        meta: {
            title: 'ai',
            name: 'ai',
            menu: false
        }
    }],
    'automations:query': [{
        path: '/automations',
        name: 'automations',
        component: () => import('@/views/automations/index.vue'),
        meta: {
            title: 'automations',
            name: 'automations',
            menu: true
        }
    }],
    'integrations:query': [{
        path: '/integrations',
        name: 'integrations',
        component: () => import('@/views/integrations/index.vue'),
        meta: {
            title: 'integrations',
            name: 'integrations',
            menu: true
        }
    }]
}

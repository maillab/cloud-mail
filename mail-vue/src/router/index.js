import {createRouter, createWebHistory} from 'vue-router'
import NProgress from 'nprogress';
import {useUiStore} from "@/store/ui.js";
import {useUserStore} from "@/store/user.js";
import {requiredPermForPath} from "@/perm/perm.js";
import {bootstrapState} from "@/init/bootstrap-state.js";
import i18n from "@/i18n/index.js";

const routes = [
    {
        path: '/',
        name: 'layout',
        redirect: '/overview',
        component: () => import('@/layout/index.vue'),
        children: [
            {
                path: '/overview',
                name: 'overview',
                component: () => import('@/views/hq/overview.vue'),
                meta: {title: 'overview', name: 'overview', menu: true}
            },
            {
                path: '/inbox',
                name: 'email',
                component: () => import('@/views/email/index.vue'),
                meta: {
                    title: 'inbox',
                    name: 'email',
                    menu: true
                }
            },
            {
                path: '/mail',
                name: 'mail',
                component: () => import('@/views/email/index.vue'),
                meta: {title: 'inbox', name: 'email', menu: true}
            },
            {
                // Support Inbox: a primary destination that resolves the
                // member's Support shared mailbox and hands off to the shared
                // Mail conversation view.
                path: '/support',
                name: 'support-inbox',
                component: () => import('@/views/support-inbox/index.vue'),
                meta: {title: 'supportInbox', name: 'support-inbox', menu: true}
            },
            {
                path: '/sent',
                name: 'send',
                component: () => import('@/views/send/index.vue'),
                meta: {title: 'sent', name: 'send', menu: true}
            },
            {
                path: '/drafts',
                name: 'draft',
                component: () => import('@/views/draft/index.vue'),
                meta: {title: 'drafts', name: 'draft', menu: true}
            },
            {
                path: '/:mailbox(inbox|starred|sent|all-mail)/messages',
                name: 'content',
                component: () => import('@/views/content/index.vue'),
                meta: {
                    title: 'message',
                    name: 'content',
                    menu: false
                }
            },
            {
                path: '/messages',
                name: 'message-detail',
                component: () => import('@/views/content/index.vue'),
                meta: {
                    title: 'message',
                    name: 'content',
                    menu: false
                }
            },
            {
                path: '/settings',
                name: 'setting',
                component: () => import('@/views/setting/index.vue'),
                meta: {
                    title: 'settings',
                    name: 'setting',
                    menu: true
                }
            },
            {
                path: '/starred',
                name: 'star',
                component: () => import('@/views/star/index.vue'),
                meta: {
                    title: 'starred',
                    name: 'star',
                    menu: true
                }
            },
            {
                path: '/folders/:folderKey',
                name: 'mail-folder',
                component: () => import('@/views/folder/index.vue'),
                meta: {title: 'mail', name: 'mail-folder', menu: true}
            },
            {
                path: '/settings/folders',
                name: 'folder-settings',
                component: () => import('@/views/folder-settings/index.vue'),
                meta: {title: 'folderSettings', name: 'folder-settings', menu: true}
            },
            {
                path: '/templates',
                name: 'templates',
                component: () => import('@/views/templates/index.vue'),
                meta: {title: 'templates', name: 'templates', menu: true}
            },
            {
                path: '/users',
                name: 'user',
                component: () => import('@/views/user/index.vue'),
                meta: {title: 'people', name: 'user', menu: true}
            },
            {
                path: '/crm/contacts',
                name: 'crm-contacts',
                component: () => import('@/views/crm/index.vue'),
                meta: {title: 'crmContacts', name: 'crm-contacts', menu: true}
            },
            {
                path: '/crm/contacts/:id',
                name: 'crm-contact',
                component: () => import('@/views/crm/[id].vue'),
                meta: {title: 'crmContact', name: 'crm-contact', menu: false}
            },
            {
                path: '/crm/companies',
                name: 'crm-companies',
                component: () => import('@/views/crm/companies.vue'),
                meta: {title: 'crmCompanies', name: 'crm-companies', menu: true}
            },
            {
                path: '/crm/pipelines',
                name: 'crm-pipelines',
                component: () => import('@/views/crm/pipelines.vue'),
                meta: {title: 'crmPipelines', name: 'crm-pipelines', menu: true}
            },
            {
                path: '/crm/deals',
                name: 'crm-deals',
                component: () => import('@/views/crm/deals.vue'),
                meta: {title: 'crmDeals', name: 'crm-deals', menu: true}
            },
            {
                path: '/crm/tasks',
                name: 'crm-tasks',
                component: () => import('@/views/crm/tasks.vue'),
                meta: {title: 'crmTasks', name: 'crm-tasks', menu: true}
            },
            {
                path: '/crm/leads',
                name: 'crm-leads',
                component: () => import('@/views/crm/leads.vue'),
                meta: {title: 'crmLeads', name: 'crm-leads', menu: true}
            },
            {
                path: '/crm/overview',
                name: 'crm-overview',
                component: () => import('@/views/crm/overview.vue'),
                meta: {title: 'crmOverview', name: 'crm-overview', menu: true}
            },
            {
                path: '/crm/organizations',
                name: 'crm-organizations',
                component: () => import('@/views/crm/organizations.vue'),
                meta: {title: 'crmOrganizations', name: 'crm-organizations', menu: true}
            },
            {
                path: '/crm/relationships',
                name: 'crm-relationships',
                component: () => import('@/views/crm/relationships.vue'),
                meta: {title: 'crmRelationships', name: 'crm-relationships', menu: true}
            },
            {
                path: '/crm/events',
                name: 'crm-events',
                component: () => import('@/views/crm/events.vue'),
                meta: {title: 'crmEvents', name: 'crm-events', menu: true}
            },
            {
                path: '/crm/activities',
                name: 'crm-activities',
                component: () => import('@/views/crm/activities.vue'),
                meta: {title: 'crmActivities', name: 'crm-activities', menu: true}
            },
            {
                path: '/projects',
                name: 'projects',
                component: () => import('@/views/projects/index.vue'),
                meta: {title: 'projects', name: 'projects', menu: true}
            },
            {
                path: '/calendar',
                name: 'calendar',
                component: () => import('@/views/calendar/index.vue'),
                meta: {title: 'calendar', name: 'calendar', menu: true}
            },
            {
                path: '/notes',
                name: 'notes',
                component: () => import('@/views/notes/index.vue'),
                meta: {title: 'notes', name: 'notes', menu: true}
            },
            {
                path: '/role',
                name: 'role',
                component: () => import('@/views/role/index.vue'),
                meta: {title: 'accessControl', name: 'role', menu: true}
            },
            {
                // Admin management of company shared mailboxes (info@, hello@,
                // support@). Permission-gated by mailbox:manage in the nav and
                // on every backend call.
                path: '/admin/shared-mailboxes',
                name: 'admin-shared-mailboxes',
                component: () => import('@/views/admin/shared-mailboxes/index.vue'),
                meta: {title: 'sharedMailboxes', name: 'admin-shared-mailboxes', menu: true}
            },
            {
                // Support work is tracked as internal requests; the old
                // standalone view is kept on disk but no longer routable.
                path: '/support',
                redirect: { name: 'requests' }
            },
            {
                // Approvals is not a release-ready workspace yet; it exposes raw
                // requester/approver ids and duplicate records. Send it to the
                // Requests workspace instead of rendering a half-built screen.
                path: '/approvals',
                redirect: '/requests'
            },
            {
                path: '/requests',
                name: 'requests',
                component: () => import('@/views/requests/index.vue'),
                meta: {title: 'internalRequests', name: 'requests', menu: true}
            },
            {
                path: '/documents',
                name: 'documents',
                component: () => import('@/views/documents/index.vue'),
                meta: {title: 'documents', name: 'documents', menu: true}
            },
            {
                path: '/finance',
                name: 'finance',
                component: () => import('@/views/finance/index.vue'),
                meta: {title: 'finance', name: 'finance', menu: true}
            },
            {
                path: '/whatsapp',
                name: 'whatsapp',
                redirect: '/coming-soon/whatsapp'
            },
            {
                path: '/ai',
                name: 'ai',
                redirect: '/coming-soon/xpass-one'
            },
            {
                // No automation engine exists yet; keep the URL alive instead
                // of rendering a shell that only looks like a feature.
                path: '/automations',
                redirect: { name: 'overview' }
            },
            {
                path: '/integrations',
                name: 'integrations',
                component: () => import('@/views/integrations/index.vue'),
                meta: {title: 'integrations', name: 'integrations', menu: true}
            },
            {
                // Administration destinations. These were referenced by the
                // sidebar and the permission map but never registered, so every
                // admin link was a dead button. Each is permission-gated.
                path: '/role',
                name: 'role',
                component: () => import('@/views/role/index.vue'),
                meta: {title: 'accessControl', name: 'role', menu: true}
            },
            {
                path: '/all-email',
                name: 'all-email',
                component: () => import('@/views/all-email/index.vue'),
                meta: {title: 'allMail', name: 'all-email', menu: true}
            },
            {
                path: '/sys-setting',
                name: 'sys-setting',
                component: () => import('@/views/sys-setting/index.vue'),
                meta: {title: 'companySettings', name: 'sys-setting', menu: true}
            },
            {
                path: '/analysis',
                name: 'analysis',
                component: () => import('@/views/analysis/index.vue'),
                meta: {title: 'reports', name: 'analysis', menu: true}
            },
            {
                path: '/crm/organizations/:id',
                name: 'crm-organization-detail',
                component: () => import('@/views/crm/organization-detail.vue'),
                meta: {title: 'crmOrganizationDetail', name: 'crm-organization-detail', menu: false}
            },
            {
                path: '/crm/deals/:id',
                name: 'crm-deal-detail',
                component: () => import('@/views/crm/deal-detail.vue'),
                meta: {title: 'crmDealDetail', name: 'crm-deal-detail', menu: false}
            },
            {
                // Single destination for every feature that is not reliable
                // enough to ship yet. The feature id selects the copy.
                path: '/coming-soon/:feature',
                name: 'coming-soon',
                component: () => import('@/components/coming-soon/index.vue'),
                meta: {name: 'coming-soon', menu: true}
            },
            {
                path: '/announcements',
                name: 'announcements',
                component: () => import('@/views/announcements/index.vue'),
                meta: {title: 'announcements', name: 'announcements', menu: true}
            },
        ]

    },
    {
        path: '/login',
        name: 'login',
        component: () => import('@/views/login/index.vue')
    },
    {
        // Public, read-only invoice shared by a secure token. No auth required.
        path: '/invoice/:token',
        name: 'public-invoice',
        component: () => import('@/views/public/InvoiceView.vue')
    },
    {
        // First-login security setup. Reached only with an onboarding-scope
        // session; the backend refuses every business API until it is finished.
        path: '/onboarding',
        name: 'onboarding',
        component: () => import('@/views/onboarding/index.vue')
    },
    {
        path: '/:pathMatch(.*)*',
        name: '404',
        component: () => import('@/views/404/index.vue')
    }
]


const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes
})

NProgress.configure({
    showSpinner: false,   // 不显示旋转图标
    trickleSpeed: 50,    // 自动递增速度
    minimum: 0.1          // 最小百分比
});

let timer
let first = true

router.beforeEach((to, _from, next) => {

    if (timer) {
        clearTimeout(timer)
    }

    if (!first) {
        timer = setTimeout(() => {
            NProgress.start()
        }, 100)
    }

    const token = localStorage.getItem('token')

    // Public invoice share links are viewable without signing in. The token in
    // the path is the credential; the page calls the unauthenticated endpoint.
    if (to.path.startsWith('/invoice/')) {
        return next()
    }

    if (!token && !to.path.startsWith('/login')) {
        return next({name: 'login'})
    }

    if (!token && to.path.startsWith('/login')) {
        return next()
    }

    if (token && to.path.startsWith('/login')) {
        return next({name: 'layout'})
    }

    // Security setup is not a business page. A token without an identity is not
    // allowed in, and a token with one but unfinished security is sent there.
    if (to.path.startsWith('/onboarding')) {
        return next()
    }

    // Frontend authorization: block module routes the user's role cannot access.
    const userStore = useUserStore()
    const permKeys = userStore.user?.permKeys || []

    // A token without an identity is stale. The check only applies once bootstrap
    // has settled: while it is still running, the identity is simply not here yet.
    if (bootstrapState.settled && !Array.isArray(userStore.user?.permKeys)) {
        localStorage.removeItem('token')
        return next({name: 'login'})
    }

    // A member who still owes security setup must not reach the shell. The
    // backend enforces the same rule; this is only the routing half.
    if (userStore.user?.security?.onboardingComplete === false) {
        return next({name: 'onboarding'})
    }

    const required = requiredPermForPath(to.path)
    if (required && !permKeys.includes(required) && !permKeys.includes('*')) {
        return next({name: 'overview'})
    }

    next()

})

router.afterEach((to) => {

    clearTimeout(timer)
    if (first) {
        removeLoading()
    } else {
        NProgress.done();
    }

    const uiStore = useUiStore()
    if (to.meta.menu) {
        uiStore.accountShow = false
    }

    if (window.innerWidth < 1025) {
        uiStore.asideShow = false
    }

    const pageTitle = to.meta.title
        ? i18n.global.t(to.meta.title)
        : to.name === 'login' ? 'Sign in' : 'XPass HQ'
    document.title = `${pageTitle} | XPass HQ`

    first = false
})

function removeLoading() {
    const doc = document.getElementById('loading-first');
    if (!doc) {
        return;
    }

    doc.remove()
}

export default router

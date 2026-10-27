import {createRouter, createWebHistory} from 'vue-router'
import NProgress from 'nprogress';
import {useUiStore} from "@/store/ui.js";

const routes = [
    {
        path: '/',
        name: 'layout',
        redirect: '/inbox',
        component: () => import('@/layout/index.vue'),
        children: [
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
        ]

    },
    {
        path: '/login',
        name: 'login',
        component: () => import('@/views/login/index.vue')
    },
    {
        path: '/test',
        name: 'test',
        component: () => import('@/views/test/index.vue')
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

    if (!token && !to.path.startsWith('/login')) {
        return next({name: 'login'})
    }

    if (!token && to.path.startsWith('/login')) {
        return next()
    }

    if (token && to.path.startsWith('/login')) {
        return next({name: 'layout'})
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

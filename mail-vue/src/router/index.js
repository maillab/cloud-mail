// 导入 Vue Router 4.x 的函数
import {createRouter, createWebHistory} from 'vue-router'
// 导入进度条库
import NProgress from 'nprogress';
// 导入 Pinia store
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
// 导入一个工具函数
import {cvtR2Url} from "@/utils/convert.js";

// 定义路由表
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
                meta: { title: 'inbox', name: 'email', menu: true }
            },
            {
                path: '/message',
                name: 'content',
                component: () => import('@/views/content/index.vue'),
                meta: { title: 'message', name: 'content', menu: false }
            },
            {
                path: '/settings',
                name: 'setting',
                component: () => import('@/views/setting/index.vue'),
                meta: { title: 'settings', name: 'setting', menu: true }
            },
            {
                path: '/starred',
                name: 'star',
                component: () => import('@/views/star/index.vue'),
                meta: { title: 'starred', name: 'star', menu: true }
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
        path: '/:pathMatch(.*)*', // 404 页面匹配规则
        name: '404',
        component: () => import('@/views/404/index.vue')
    }
];

// 创建路由实例
const router = createRouter({
    // 使用 HTML5 History 模式，URL 更美观
    history: createWebHistory(import.meta.env.BASE_URL),
    routes
});

// 配置页面顶部加载进度条
NProgress.configure({
    showSpinner: false,
    trickleSpeed: 50,
    minimum: 0.1
});

let timer;
let first = true;

// 全局前置守卫 (在每次路由跳转前触发)
router.beforeEach((to, from, next) => {
    // --- 进度条逻辑 ---
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        NProgress.start();
    }, first ? 200 : 100);

    // --- 登录验证逻辑 ---
    const token = localStorage.getItem('token');

    // 1. 如果没有 token 且想访问非登录页，强制跳转到登录页
    if (!token && to.name !== 'login') {
        return next({name: 'login'});
    }

    // 2. 如果没有 token 且正在访问登录页，加载背景图后放行
    if (!token && to.name === 'login') {
        loadBackground(next);
        return;
    }

    // 3. 如果有 token 且想访问登录页，则留在当前页面
    if (token && to.name === 'login') {
        return next(from.path);
    }

    // 4. 其他情况（有 token 访问其他页面），直接放行
    next();
});

// 登录页背景图预加载函数
function loadBackground(next) {
    const settingStore = useSettingStore();
    if (settingStore.settings.background) {
        const src = cvtR2Url(settingStore.settings.background);
        const img = new Image();
        img.src = src;
        // 成功或失败都必须执行 next()，否则页面会卡住
        img.onload = () => next();
        img.onerror = () => {
            console.warn("背景图片加载失败:", img.src);
            next();
        };
        // 添加一个超时，防止图片加载过久导致页面无法进入
        setTimeout(() => {
            console.warn("背景加载超时，已放行");
            next();
        }, 3000);
    } else {
        next();
    }
}

// 全局后置钩子 (在每次路由跳转后触发)
router.afterEach((to) => {
    // --- 进度条和 UI 状态处理 ---
    clearTimeout(timer);
    NProgress.done();
    first = false;

    const uiStore = useUiStore();
    // 根据路由元信息和窗口宽度，控制侧边栏的显示/隐藏
    if (to.meta.menu) {
        if (['content', 'email', 'send'].includes(to.meta.name)) {
            uiStore.accountShow = window.innerWidth > 767;
        } else {
            uiStore.accountShow = false;
        }
    }
    if (window.innerWidth < 1025) {
        uiStore.asideShow = false;
    }
});

// 导出路由实例
export default router;

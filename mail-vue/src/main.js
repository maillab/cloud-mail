import {createApp} from 'vue';
import App from './App.vue';
import router from './router';
import './style.css';
import { init } from '@/init/init.js';
import { createPinia } from 'pinia';
import piniaPersistedState from 'pinia-plugin-persistedstate';
import 'element-plus/theme-chalk/dark/css-vars.css';
import 'nprogress/nprogress.css';
import perm from "@/perm/perm.js";
// 注册 service worker。新版本部署后 sw.js 变化，新 worker 立即接管页面，
// 这里监听接管事件后刷新页面；首次安装时没有旧 worker，不刷新。每小时主动检查一次更新。
if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || window.__swReloading) return
        window.__swReloading = true
        window.location.reload()
    })
    window.addEventListener('load', () => {
        navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
            .then(registration => setInterval(() => registration.update(), 60 * 60 * 1000))
            .catch(error => console.warn('service worker 注册失败', error))
    })
}
const pinia = createPinia().use(piniaPersistedState)
import i18n from "@/i18n/index.js";
const app = createApp(App).use(pinia)
await init()
app.use(router).use(i18n).directive('perm',perm)
app.config.devtools = true;

app.mount('#app');

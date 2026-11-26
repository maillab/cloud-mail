import {createApp} from 'vue';
import App from './App.vue';
import router from './router';
import 'element-plus/theme-chalk/dark/css-vars.css';
import 'nprogress/nprogress.css';
import './style.css';
import { init, bootstrapState } from '@/init/init.js';
import { createPinia } from 'pinia';
import piniaPersistedState from 'pinia-plugin-persistedstate';
import perm from "@/perm/perm.js";
import { installLegacyIcons } from '@/utils/legacy-icons.js';
const pinia = createPinia().use(piniaPersistedState)
import i18n from "@/i18n/index.js";

const app = createApp(App).use(pinia)
installLegacyIcons(app)
// The router is deliberately NOT installed here. Installing it starts the
// initial navigation immediately, which would run the guard before bootstrap
// has established an identity and send a signed-in employee to /login.
app.use(i18n).directive('perm',perm)
app.config.devtools = true;

// Remove the HTML splash. The router also removes it after the first navigation,
// but doing it here as well means a router that never resolves cannot leave the
// logo on screen forever.
function removeSplash() {
    const splash = document.getElementById('loading-first');
    if (splash) {
        splash.classList.add('loading-complete');
        splash.remove();
    }
}

// Bootstrap is bounded: init() itself has a deadline for every call, and this
// race is the outer guarantee. Whatever happens, the app mounts.
const BOOTSTRAP_TIMEOUT = 9000;
let bootstrapTimer = null;

try {
    await Promise.race([
        init(),
        new Promise((_, reject) => {
            bootstrapTimer = setTimeout(() => reject(new Error('bootstrap timed out')), BOOTSTRAP_TIMEOUT);
        })
    ]);
} catch (err) {
    // Fail closed. Without an identity there is nothing to render but sign-in,
    // and leaving a stale token would loop between the shell and /login.
    console.error('startup bootstrap failed', err);
    localStorage.removeItem('token');
} finally {
    if (bootstrapTimer) clearTimeout(bootstrapTimer);
    // The guard may now trust what it sees: bootstrap is either complete or
    // definitively failed, so a token without an identity really is stale.
    bootstrapState.settled = true;
    app.use(router);
    app.mount('#app');
    removeSplash();
}
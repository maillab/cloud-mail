// Application bootstrap. Runs before the app is mounted, so everything here has
// to settle: a bootstrap that can hang would keep the XPass splash on screen
// forever, because the splash is only removed once the router completes its
// first navigation.
//
// Two rules hold this file together:
//   1. Every awaited call has a deadline (see withTimeout).
//   2. Nothing here may throw out of init(); the caller always gets a value.
//
// If identity cannot be established the token is dropped and the router guard
// sends the employee to sign-in. A token that cannot be validated in time is
// treated as stale, because leaving it in place would render an authenticated
// shell with no user behind it.

import {useUserStore} from "@/store/user.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter} from "@/perm/perm.js";
import router from "@/router";
import {websiteConfig} from "@/request/setting.js";
import i18n from "@/i18n/index.js";

// Branding and identity are both allowed six seconds. Together that is the
// worst case before the app mounts, which is short enough that a failing
// backend shows the sign-in page rather than an endless logo.
const CALL_TIMEOUT = 6000;

function withTimeout(promise, ms, label) {
    let timer;
    const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

// Recorded so the shell can show a recoverable reason instead of failing silently.
// `settled` is set by main.js once bootstrap has either succeeded or definitively
// failed; the router guard uses it to know whether a missing identity is real.
export { bootstrapState } from './bootstrap-state.js';
import { bootstrapState } from './bootstrap-state.js';

export async function init() {
    document.title = 'XPass HQ';

    const settingStore = useSettingStore();
    const userStore = useUserStore();
    const accountStore = useAccountStore();

    const token = localStorage.getItem('token');
    settingStore.lang = 'en';

    i18n.global.locale.value = settingStore.lang;

    // Neither of these may take the application down: a settings or identity
    // failure must still leave a renderable shell (sign-in or a degraded app).
    const safeSetting = websiteConfig({timeout: CALL_TIMEOUT}).catch(e => {
        console.error('website config failed', e);
        bootstrapState.error = e;
        return null;
    });

    let setting = null;

    if (token) {
        const userPromise = loginUserInfo({timeout: CALL_TIMEOUT}).catch(e => {
            console.error(e);
            bootstrapState.error = e;
            return null;
        });

        let s = null;
        let user = null;
        try {
            [s, user] = await withTimeout(
                Promise.all([safeSetting, userPromise]),
                CALL_TIMEOUT + 1500,
                'startup'
            );
        } catch (e) {
            // The deadline is the last line of defence: if either call ignored
            // its own timeout, startup still proceeds.
            console.error('startup timed out', e);
            bootstrapState.error = e;
        }

        setting = s;
        if (setting) {
            settingStore.settings = setting;
            settingStore.domainList = setting.domainList;
            bootstrapState.configReady = true;
        }
        document.title = 'XPass HQ';

        if (user) {
            const account = user.account || null;
            accountStore.currentAccountId = account ? account.accountId : null;
            accountStore.currentAccount = account;
            userStore.user = user;
            bootstrapState.identityReady = true;

            const routers = permsToRouter(user.permKeys || []);
            routers.forEach(routerData => {
                router.addRoute('layout', routerData);
            });
        } else {
            // The stored token no longer resolves to a user: drop it so the
            // router guard sends the employee to sign-in instead of rendering
            // a shell with no identity, no role and no permissions.
            localStorage.removeItem('token');
        }

    } else {
        try {
            setting = await withTimeout(safeSetting, CALL_TIMEOUT + 1500, 'startup');
        } catch (e) {
            console.error('startup timed out', e);
            bootstrapState.error = e;
        }
        if (setting) {
            settingStore.settings = setting;
            settingStore.domainList = setting.domainList;
            bootstrapState.configReady = true;
        }
        document.title = 'XPass HQ';
    }
}
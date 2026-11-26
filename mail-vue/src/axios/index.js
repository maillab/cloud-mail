import axios from "axios";
import router from "@/router";
import i18n from "@/i18n/index.js";
import {useSettingStore} from "@/store/setting.js";

let http = axios.create({
    baseURL: import.meta.env.VITE_BASE_URL,
    // A request that never answers must fail instead of hanging. Without this a
    // single stalled call during startup kept the splash on screen forever,
    // because everything downstream was awaiting a promise that never settled.
    timeout: 12000
});

// A busy connection can cause several widgets to expire together. One useful
// message is enough; a stack of duplicate red toasts makes the product look
// broken and hides the page-level recovery state that each screen provides.
const recentFailures = new Map();
function showFailureOnce(key, options) {
    const now = Date.now();
    if (now - (recentFailures.get(key) || 0) < 8000) return;
    recentFailures.set(key, now);
    ElMessage({ plain: true, grouping: true, repeatNum: -4, ...options });
}

http.interceptors.request.use(config => {
    config.headers.Authorization = `${localStorage.getItem('token')}`
    config.headers['accept-language'] = 'en'
    return config
})

http.interceptors.response.use((res) => {

        return new Promise((resolve, reject) => {

            const noMsg = res.config.noMsg;
            const data = res.data

            if (noMsg) {

                data.code === 200 ? resolve(data.data) : reject(data)

            } else if (data.code === 401) {
                console.log('[startup] 401 from', res.config && res.config.url, data.message)
                ElMessage({
                    message: data.message,
                    type: 'error',
                    plain: true,
                    grouping: true,
                    repeatNum: -4,
                })
                localStorage.removeItem('token')
                // The router may not be installed yet when a startup call comes
                // back 401; guard so a rejected identity check cannot throw
                // inside the interceptor and leave the caller hanging.
                try {
                    router.replace('/login')
                } catch (e) {
                    console.error('could not redirect to login', e)
                }
                reject(data)
            } else if (data.code === 403) {
                ElMessage({
                    message: data.message,
                    type: 'warning',
                    plain: true,
                    grouping: true,
                    repeatNum: -4,
                })
                reject(data)

            } else if (data.code === 428) {
                // 428 means the session is valid but unfinished: either the
                // password was right and the authenticator step is still owed,
                // or the member has not completed first-login security. Both are
                // handled by the caller (login view / router), so this is not an
                // error toast.
                reject(data)

            } else if (data.code === 502) {
                ElMessage({
                    dangerouslyUseHTMLString: true,
                    message: data.message,
                    type: 'error',
                    plain: true,
                    grouping: true,
                    repeatNum: -4,
                })
                reject(data)
            } else if (data.code !== 200) {
                ElMessage({
                    message: data.message,
                    type: 'error',
                    plain: true,
                    grouping: true,
                    repeatNum: -4,
                })
                reject(data)
            }
            resolve(data.data)
        })
    },
    (error) => {

        if (error.status === 403) {
            location.reload();
            return;
        }

        const noMsg = error.config.noMsg;

        if (noMsg) {
            return Promise.reject(error)
        } else if (error.message.includes('Network Error')) {
            showFailureOnce(`network:${error.config?.url || ''}`, {
                message: i18n.global.t('networkErrorMsg'),
                type: 'error',
            })
        } else if (error.code === 'ECONNABORTED') {
            showFailureOnce(`timeout:${error.config?.url || ''}`, {
                message: 'This section is taking longer than expected. You can keep working and retry it when ready.',
                type: 'error',
            })
        } else if (error.response) {
            showFailureOnce(`server:${error.config?.url || error.response?.status || ''}`, {
                message: i18n.global.t('serverBusyErrorMsg'),
                type: 'error',
            })
        } else {
            showFailureOnce(`request:${error.config?.url || ''}`, {
                message: i18n.global.t('reqFailErrorMsg'),
                type: 'error',
            })
        }
        return Promise.reject(error)
    })

export default http


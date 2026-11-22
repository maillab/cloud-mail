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
            ElMessage({
                message: i18n.global.t('networkErrorMsg'),
                type: 'error',
                plain: true,
                grouping: true,
                repeatNum: -4,
            })
        } else if (error.code === 'ECONNABORTED') {
            ElMessage({
                message: i18n.global.t('timeoutErrorMsg'),
                type: 'error',
                plain: true,
                grouping: true
            })
            ElMessage.error('')
        } else if (error.response) {
            ElMessage({
                message: i18n.global.t('serverBusyErrorMsg'),
                type: 'error',
                plain: true,
                grouping: true,
                repeatNum: -4,
            })
        } else {
            ElMessage({
                message: i18n.global.t('reqFailErrorMsg'),
                type: 'error',
                plain: true,
                grouping: true,
                repeatNum: -4,
            })
        }
        return Promise.reject(error)
    })

export default http


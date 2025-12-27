import { createI18n } from 'vue-i18n';
import en from './en.js'
import baihua from './zh-CN.js'
import wenyan from './wenyan.js'
const i18n = createI18n({
    legacy: false,
    messages: {
        baihua,
        wenyan,
        en
    },
});

export default i18n;
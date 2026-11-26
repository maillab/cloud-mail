import { createI18n } from 'vue-i18n';
import en from './en.js'
const i18n = createI18n({
    legacy: false,
    messages: {
        en
    },
    locale: 'en',
    fallbackLocale: 'en',
});

export default i18n;
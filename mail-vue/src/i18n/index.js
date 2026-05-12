import { createI18n } from 'vue-i18n';
import en from './en.js'
import zh from './zh.js'
import ja from './ja.js'
const i18n = createI18n({
    legacy: false,
    messages: {
        zh,
        en,
        ja
    },
});

export default i18n;

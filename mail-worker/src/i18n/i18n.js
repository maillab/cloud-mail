import i18next from 'i18next';
import zh from './zh.js'
import zhTW from './zh-TW.js'
import en from './en.js'
import app from '../hono/hono';

app.use('*', async (c, next) => {
	const header = c.req.header('accept-language') || ''
	let lang = 'zh'
	if (/^zh-(TW|HK|MO)$/i.test(header) || header === 'zh-Hant') {
		lang = 'zh-TW'
	} else if (header.startsWith('zh')) {
		lang = 'zh'
	} else if (header.startsWith('en')) {
		lang = 'en'
	}
	i18next.init({
		lng: lang,
	});
	return await next()
})

const resources = {
	en: {
		translation: en
	},
	zh: {
		translation: zh,
	},
	'zh-TW': {
		translation: zhTW,
	},
};

i18next.init({
	fallbackLng: 'zh',
	resources,
});

export const t = (key, values) => i18next.t(key, values)

export default i18next;

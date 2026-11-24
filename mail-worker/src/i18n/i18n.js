import i18next from 'i18next';
import zh from './zh.js'
import en from './en.js'
import app from '../hono/hono';

app.use('*', async (c, next) => {
	const lang = c.req.header('accept-language')?.split('-')[0] || 'en'
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
};

i18next.init({
	fallbackLng: 'en',
	resources,
});

export const t = (key, values) => i18next.t(key, values)

export default i18next;

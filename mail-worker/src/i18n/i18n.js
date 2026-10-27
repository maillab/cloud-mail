import i18next from 'i18next';
import en from './en.js'
import app from '../hono/hono';

app.use('*', async (c, next) => {
	i18next.init({
		lng: 'en',
	});
	return await next()
})

const resources = {
	en: {
		translation: en
	},
};

i18next.init({
	lng: 'en',
	fallbackLng: 'en',
	resources,
});

export const t = (key, values) => i18next.t(key, values)

export default i18next;

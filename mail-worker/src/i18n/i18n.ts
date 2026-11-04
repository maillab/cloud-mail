import i18next from 'i18next';
import zh from './zh'
import en from './en'
import type { EnvContext, HttpContext } from '../types/context';

const resources = {
	en: {
		translation: en
	},
	zh: {
		translation: zh,
	},
};

void i18next.init({
	initImmediate: false,
	fallbackLng: 'zh',
	resources,
});

export const t = (key: string, values?: Record<string, unknown>): string => i18next.t(key, { ...values, returnObjects: false })

export function tFor(c: EnvContext & { req?: Pick<HttpContext['req'], 'header'> }) {
	const language = c.req?.header('accept-language')?.split('-')[0] || 'zh';
	const fixed = i18next.getFixedT(language);
	return (key: string, values?: Record<string, unknown>): string => fixed(key, { ...values, returnObjects: false });
}

export default i18next;

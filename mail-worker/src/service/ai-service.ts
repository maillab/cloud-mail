import emailUtils from '../utils/email-utils';
import { settingConst } from '../const/entity-const';
import type { EnvContext } from '../types/context';
import { extractVerificationCode } from '../integrations/ai-gateway';

interface CodeEmail {
	subject?: string | null;
	text?: string | null;
	html?: string | null;
	from?: { address?: string | null };
}
interface CodeOptions { aiCode?: number; aiCodeFilter?: string; }

const aiService = {
	async extractCode(c: EnvContext, email: CodeEmail, options: CodeOptions = {}): Promise<string> {
		if (!this.shouldExtractCode(options.aiCode, options.aiCodeFilter, email)) {
			return '';
		}

		const ai = c.env.ai;

		try {
			if (!ai) throw new TypeError("Cannot read properties of undefined (reading 'run')");
			const subject = email.subject || '';
			const text = emailUtils.formatText(email.text || '');
			const htmlText = emailUtils.htmlToText(email.html || '');
			const body = (htmlText || text).slice(0, 6000);

			if (!subject && !body) {
				return '';
			}

			return await extractVerificationCode(ai, c.env.ai_model || '@cf/meta/llama-3.1-8b-instruct-fast', subject, body);
		} catch (e) {
			console.error('验证码提取失败: ', e);
			return '';
		}
	},

	shouldExtractCode(aiCode: number | undefined, aiCodeFilterStr: string | undefined, email: CodeEmail): boolean {
		if (aiCode !== settingConst.aiCode.OPEN) {
			return false;
		}

		const filterList = aiCodeFilterStr ? aiCodeFilterStr.split(',').map(item => item.trim().toLowerCase()).filter(Boolean) : [];

		if (filterList.length === 0) {
			return true;
		}

		const fromEmail = (email.from?.address || '').trim().toLowerCase();
		const fromDomain = emailUtils.getDomain(fromEmail).toLowerCase();

		return filterList.some(item => item === fromEmail || item === fromDomain);
	}
};

export default aiService;

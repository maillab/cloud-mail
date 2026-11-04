import BizError from '../error/biz-error';
import settingsReader from './settings-reader';
import { t } from '../i18n/i18n'
import type { RequestMetadataContext } from '../types/context';
import { verifyTurnstile } from '../integrations/turnstile-gateway';

const turnstileService = {

	async verify(c: RequestMetadataContext, token?: string | null): Promise<void> {

		if (!token) {
			throw new BizError(t('emptyBotToken'),400);
		}

		const settingRow = await settingsReader.query(c)

		const success = await verifyTurnstile({ secret: settingRow.secretKey, token, ip: c.req.header('cf-connecting-ip') });
		if (!success) {
			throw new BizError(t('botVerifyFail'),400)
		}
	}
};

export default turnstileService;

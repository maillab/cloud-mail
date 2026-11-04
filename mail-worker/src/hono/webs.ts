import { createHono } from './hono';
import { registerSecurity } from '../security/security';
import { registerEmailApi } from '../api/email-api';
import { registerUserApi } from '../api/user-api';
import { registerLoginApi } from '../api/login-api';
import { registerSettingApi } from '../api/setting-api';
import { registerAccountApi } from '../api/account-api';
import { registerStarApi } from '../api/star-api';
import { registerR2Api } from '../api/r2-api';
import { registerResendApi } from '../api/resend-api';
import { registerMyApi } from '../api/my-api';
import { registerRoleApi } from '../api/role-api';
import { registerAllEmailApi } from '../api/all-email-api';
import { registerInitApi } from '../api/init-api';
import { registerAnalysisApi } from '../api/analysis-api';
import { registerRegKeyApi } from '../api/reg-key-api';
import { registerPublicApi } from '../api/public-api';
import { registerTelegramApi } from '../api/telegram-api';
import { registerOauthApi } from '../api/oauth-api';

export function createApp() {
	const app = createHono();
	registerSecurity(app);
	registerEmailApi(app);
	registerUserApi(app);
	registerLoginApi(app);
	registerSettingApi(app);
	registerAccountApi(app);
	registerStarApi(app);
	registerR2Api(app);
	registerResendApi(app);
	registerMyApi(app);
	registerRoleApi(app);
	registerAllEmailApi(app);
	registerInitApi(app);
	registerAnalysisApi(app);
	registerRegKeyApi(app);
	registerPublicApi(app);
	registerTelegramApi(app);
	registerOauthApi(app);
	return app;
}

const app = createApp();
export default app;

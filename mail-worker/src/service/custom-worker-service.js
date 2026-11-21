const customWorkerService = {

	async sendEmail(c, emailRow, message, email) {
		const env = c.env;
		const ctx = c.ctx || c.executionCtx;

		try {
			// 用户在此处手动修改自定义 Cloudflare Worker 转发代码
		} catch (e) {
			console.error('自定义 Worker 转发失败: ', e);
		}
	}

};

export default customWorkerService;

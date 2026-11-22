const result = {
	ok(data) {
		return { code: 200, message: 'success', data: data ? data : null };
	},
	// `data` carries structured context for the client (for example an
	// `mfaRequired` flag) so the UI can react without string-matching messages.
	fail(message, code = 500, data = null) {
		const body = { code, message };
		if (data) {
			body.data = data;
		}
		return body;
	}
};

export default result;
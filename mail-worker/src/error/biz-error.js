class BizError extends Error {
	constructor(message, code, data) {
		super(message);
		this.code = code ? code : 501;
		this.data = data || null;
		this.name = 'BizError';
	}
}

export default BizError;
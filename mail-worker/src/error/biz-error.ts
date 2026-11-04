class BizError extends Error {
	readonly code: number;
	constructor(message?: string, code?: number) {
		super(message);
		this.code = code ? code : 501;
		this.name = 'BizError';
	}
}

export default BizError;

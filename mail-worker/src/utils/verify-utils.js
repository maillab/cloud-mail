const verifyUtils = {
	isEmail(str) {
		return  /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+@([a-zA-Z0-9\p{L}\p{N}-]+\.)+[a-zA-Z\p{L}]{2,}$/u.test(str);
	},
	isDomain(str) {
		return /^(?!:\/\/)([a-zA-Z0-9\p{L}\p{N}-]+\.)+[a-zA-Z\p{L}]{2,}$/u.test(str);
	}
}

export default  verifyUtils

export function isEmail(email) {
    const reg = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+@([a-zA-Z0-9\p{L}\p{N}-]+\.)+[a-zA-Z\p{L}]{2,}$/u;
    return reg.test(email);
}

export function isDomain(str) {
    return /^(?!:\/\/)([a-zA-Z0-9\p{L}\p{N}-]+\.)+[a-zA-Z\p{L}]{2,}$/u.test(str);
}

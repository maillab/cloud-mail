import * as openpgp from 'openpgp';

const STORAGE_KEY = 'pgpPrivateKey';

export function getStoredPrivateKey() {
    return localStorage.getItem(STORAGE_KEY);
}

export function hasPrivateKey() {
    return !!getStoredPrivateKey();
}

export function savePrivateKey(armored) {
    localStorage.setItem(STORAGE_KEY, armored);
}

export function removePrivateKey() {
    localStorage.removeItem(STORAGE_KEY);
}

export function isPgpMessage(text) {
    return !!text && text.includes('-----BEGIN PGP MESSAGE-----');
}

export async function parsePrivateKey(armored) {
    const key = await openpgp.readPrivateKey({armoredKey: armored.trim()});
    return {
        armored: key.armor(),
        fingerprint: key.getFingerprint(),
        userIDs: key.getUserIDs(),
        needsPassphrase: !key.isDecrypted()
    };
}

async function loadDecryptionKey(passphrase) {
    const armoredKey = getStoredPrivateKey();
    if (!armoredKey) {
        throw new Error('no private key');
    }
    let privateKey = await openpgp.readPrivateKey({armoredKey});
    if (!privateKey.isDecrypted()) {
        if (!passphrase) {
            const err = new Error('passphrase required');
            err.code = 'NEED_PASSPHRASE';
            throw err;
        }
        try {
            privateKey = await openpgp.decryptKey({privateKey, passphrase});
        } catch (e) {
            const err = new Error('bad passphrase');
            err.code = 'BAD_PASSPHRASE';
            throw err;
        }
    }
    return privateKey;
}

export async function decryptText(armoredMessage, passphrase) {
    const privateKey = await loadDecryptionKey(passphrase);
    const message = await openpgp.readMessage({armoredMessage});
    const {data} = await openpgp.decrypt({message, decryptionKeys: privateKey});
    return data;
}

export async function decryptBinary(armoredMessage, passphrase) {
    const privateKey = await loadDecryptionKey(passphrase);
    const message = await openpgp.readMessage({armoredMessage});
    const {data} = await openpgp.decrypt({message, decryptionKeys: privateKey, format: 'binary'});
    return data;
}

export async function privateKeyInfo() {
    const armoredKey = getStoredPrivateKey();
    if (!armoredKey) {
        return null;
    }
    const key = await openpgp.readPrivateKey({armoredKey});
    return {
        fingerprint: key.getFingerprint(),
        userIDs: key.getUserIDs(),
        needsPassphrase: !key.isDecrypted()
    };
}

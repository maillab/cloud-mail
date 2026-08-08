import assert from 'node:assert/strict';
import cryptoUtils from '../src/utils/crypto-utils.js';
import jwtUtils from '../src/utils/jwt-utils.js';
import { verifySvixWebhook } from '../src/utils/webhook-utils.js';

const password = 'A-strong-test-password-123!';
const { salt, hash } = await cryptoUtils.hashPassword(password);
assert.match(hash, /^pbkdf2-sha256\$20000\$/);
assert.equal(await cryptoUtils.verifyPassword(password, salt, hash), true);
assert.equal(await cryptoUtils.verifyPassword(`${password}x`, salt, hash), false);
assert.equal(cryptoUtils.needsRehash(hash, 20_000), false);
assert.equal(cryptoUtils.iterationsFromEnv({ password_pbkdf2_iterations: '50000' }), 50_000);
assert.equal(cryptoUtils.iterationsFromEnv({ password_pbkdf2_iterations: '1' }), 10_000);
assert.match(cryptoUtils.genRandomPwd(20), /^[A-Za-z0-9!@#$%*_\-]{20}$/);

const context = { env: { jwt_secret: 'test-only-jwt-secret-that-is-longer-than-32-characters' } };
const token = await jwtUtils.generateToken(context, { purpose: 'unit-test', userId: 1 }, 120);
assert.equal((await jwtUtils.verifyToken(context, token, { purpose: 'unit-test' }))?.userId, 1);
assert.equal(await jwtUtils.verifyToken(context, token, { purpose: 'wrong' }), null);
assert.equal(await jwtUtils.verifyToken(context, `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`), null);

const encoder = new TextEncoder();
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const headerPart = base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
const payloadPart = base64url(encoder.encode(JSON.stringify({ purpose: 'expired', iat: 1, nbf: 1, exp: Math.floor(Date.now() / 1000) - 120 })));
const jwtKey = await crypto.subtle.importKey('raw', encoder.encode(context.env.jwt_secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const oldSignature = await crypto.subtle.sign('HMAC', jwtKey, encoder.encode(`${headerPart}.${payloadPart}`));
const expiredToken = `${headerPart}.${payloadPart}.${base64url(new Uint8Array(oldSignature))}`;
assert.equal(await jwtUtils.verifyToken(context, expiredToken, { purpose: 'expired' }), null);

const webhookSecretBytes = crypto.getRandomValues(new Uint8Array(32));
const webhookSecret = `whsec_${btoa(String.fromCharCode(...webhookSecretBytes))}`;
const id = 'msg_test_123';
const timestamp = String(Math.floor(Date.now() / 1000));
const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'abc' } });
const webhookKey = await crypto.subtle.importKey('raw', webhookSecretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const webhookDigest = await crypto.subtle.sign('HMAC', webhookKey, encoder.encode(`${id}.${timestamp}.${body}`));
const signature = `v1,${btoa(String.fromCharCode(...new Uint8Array(webhookDigest)))}`;
assert.equal(await verifySvixWebhook({ secret: webhookSecret, payload: body, id, timestamp, signature }), true);
assert.equal(await verifySvixWebhook({ secret: webhookSecret, payload: `${body}x`, id, timestamp, signature }), false);
assert.equal(await verifySvixWebhook({ secret: webhookSecret, payload: body, id, timestamp: '1', signature }), false);

console.log('security utility tests: PASS');

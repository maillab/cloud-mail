import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {normalizeInteger, normalizePageNumber, normalizePageSize, normalizePagination} from '../src/request/params.js'

assert.equal(normalizePageNumber(0), 1)
assert.equal(normalizePageNumber(''), 1)
assert.equal(normalizePageNumber('2'), 2)
assert.equal(normalizePageNumber(1_000_001), 1)
assert.equal(normalizePageSize(0, 30, 20), 20)
assert.equal(normalizePageSize('30', 30, 20), 30)
assert.equal(normalizePageSize(31, 30, 20), 20)
assert.deepEqual(normalizePagination({num: 0, size: 0}, {sizeMax: 50, defaultSize: 15}), {num: 1, size: 15})
assert.equal(normalizeInteger(-2, {defaultValue: -1, min: -2, max: 1}), -2)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const userView = fs.readFileSync(path.join(root, 'src/views/user/index.vue'), 'utf8')
assert.doesNotMatch(userView, /accountParams\.num\s*=\s*0/)
assert.doesNotMatch(userView, /const\s+accountParams\s*=\s*reactive\([\s\S]{0,160}?num:\s*0/)

const userRequest = fs.readFileSync(path.join(root, 'src/request/user.js'), 'utf8')
assert.match(userRequest, /normalizePageNumber\(num\)/)
assert.match(userRequest, /normalizePagination\(params/)

console.log('PASS: frontend API pagination contract guards')

# 邮箱账号自动转发 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户给自己的每个邮箱账号填写外部邮箱地址，验证码验证后，这个账号收到的邮件自动转发过去。

**Architecture:** 新表 `account_forward` 存每个账号的转发目标。纯逻辑（校验、验证码、渠道选择、转发参数构造）集中在 `lib/forward-rules.js`，用 vitest 单测；`service/forward-service.js` 负责数据库、KV 限频和发送，复用 `email-service` 已有的 Cloudflare Email Service / Resend 发送函数。收件入口 `email/email.js` 和站内投递 `forwardOnSiteEmail` 各加一个调用点。前端在侧栏账号下拉里加"转发设置"对话框，系统设置里加总开关。

**Tech Stack:** Cloudflare Workers、Hono、Drizzle ORM（D1）、Cloudflare KV、postal-mime、Resend SDK v6、Vue 3 + Element Plus + vue-i18n、vitest 3。

**Spec:** `docs/superpowers/specs/2026-11-10-account-forward-design.md`

**执行前提：** 当前在 `main` 分支。执行时新开分支或 worktree（`superpowers:using-git-worktrees`），不要直接提交到 `main`。

## Global Constraints

- 开关字段约定 `0 = 开，1 = 关`；新字段 `setting.user_forward` 默认 `1`（关）。
- 转发记录状态：`0` 待验证，`1` 已启用，`2` 用户停用，`3` 连续失败自动停用。
- 每个邮箱账号最多 `3` 个转发目标（任意状态都计数）。
- 验证码 `6` 位数字，有效期 `30` 分钟，连续输错 `5` 次作废。
- 验证邮件限频：同一目标地址 `60` 秒冷却；同一用户每天最多 `10` 封。
- 转发连续失败 `10` 次自动停用；成功一次清零。
- 新权限点 `perm_id = 37`，`name = '邮箱转发'`，`perm_key = 'account:forward'`，`pid = 21`，`type = 2`，`sort = 3`。
- 转发出去的邮件带信头 `X-CloudMail-Forwarded: 1` 和 `X-CloudMail-Forwarded-For: <账号地址>`；来信带 `x-cloudmail-forwarded` 的不再转发。
- 发件人地址用账号自己的地址，显示名用原发件人名字；`replyTo` 为原发件人地址；主题不加前缀。
- 总开关对管理员同样生效；管理员只绕过角色权限和角色发信类型检查。
- 角色 `sendType` 为 `ban` 或 `internal` 的用户不能添加，也不执行转发。
- 用户转发不受管理员"转发规则"（`ruleType` / `ruleEmail`）过滤；不受 `setting.send` 全局发件开关影响。
- 转发和验证邮件都不计入用户发信次数，不写入 `email` 表，不设转发上限。
- 转发用原始 HTML（内嵌图片保持 `cid:` 引用）和全部原始附件，不用库里存的带 `{{domain}}` 占位符的正文。
- 任何转发错误都不能让收件流程抛异常。
- 后端用户可见的错误文案走 `mail-worker/src/i18n/zh.js` / `en.js`；前端文案走 `mail-vue/src/i18n/zh.js` / `en.js`。

## Review Focus

1. **来信没有主题**：Cloudflare Email Service 要求 `subject` 必填。转发时用 `(no subject)` 代替，不能因此失败。由 Task 1 的 `buildForwardParams` 测试覆盖。
2. **原发件人显示名含逗号、引号、尖括号**（如 `GitHub, Inc.`）：Resend 的 `from` 是拼接字符串，未处理会解析失败。转发前清洗显示名。由 Task 1 的 `sanitizeDisplayName` 测试覆盖。
3. **来信没有 From**（部分退信、系统通知）：显示名回退到账号地址的本地部分，不设置 `replyTo`。由 Task 1 的 `buildForwardParams` 测试覆盖。
4. **用户输入带空格和大小写的地址或验证码**（如 ` Bob@EXAMPLE.com `、` 123456 `）：地址统一 trim + 小写后再做站内域名和重复判断；验证码 trim 后比较。由 Task 1 的 `validateTarget` 和 `checkVerifyCode` 测试覆盖。
5. **转发渠道抛错或超时**：收件必须照常完成，邮件照常入库，Telegram / Webhook 照常推送。由 Task 5 的手工验证第 4 步覆盖（把 Resend token 改坏后投递）。

---

## 本地验证环境（Task 3、4、5、8 共用）

后端没有可用的集成测试，以下流程用于手工验证。

1. 安装依赖并启动：

```bash
cd mail-worker && pnpm install && pnpm dev
```

2. 本地发信：把 `mail-worker/wrangler-dev.toml` 里 `#[[send_email]]` / `#name = "email"` 两行临时取消注释，使 `env.email` 可用（wrangler 本地模拟发送，会在终端日志里打印邮件内容和验证码）。**这个改动不要提交。**
3. 初始化数据库、注册管理员、取 token：

```bash
curl http://127.0.0.1:8787/api/init/b7f29a1d-18e2-4d3b-941f-f6b2c97c02fd
```

```bash
curl -s -X POST http://127.0.0.1:8787/api/register -H 'content-type: application/json' -d '{"email":"admin@example.com","password":"123456"}'
```

```bash
export TOKEN=$(curl -s -X POST http://127.0.0.1:8787/api/login -H 'content-type: application/json' -d '{"email":"admin@example.com","password":"123456"}' | jq -r .data.token)
```

请求头用 `Authorization: $TOKEN`。

4. 模拟收信：

```bash
curl -X POST "http://127.0.0.1:8787/cdn-cgi/handler/email?from=sender@outside.test&to=admin@example.com" --data-binary @test/fixtures/forward-sample.eml
```

5. 查库：

```bash
npx wrangler d1 execute email --local --config wrangler-dev.toml --command "SELECT * FROM account_forward"
```

---

### Task 1: 单测环境与转发纯逻辑

**Files:**
- Create: `mail-worker/vitest.unit.config.js`
- Modify: `mail-worker/package.json`（scripts 加 `test:unit`，不要动已有的 `test` 脚本，它是部署命令）
- Create: `mail-worker/src/lib/forward-rules.js`
- Test: `mail-worker/test/unit/forward-rules.spec.js`

**Interfaces:**
- Consumes: `verifyUtils.isEmail`（`src/utils/verify-utils.js`）、`emailUtils.getDomain` / `getName`（`src/utils/email-utils.js`）。本文件不得 import 任何依赖 `env`、数据库或 `entity-const.js` 的模块，保证能在 node 里单测。
- Produces（全部具名导出）：
  - `FORWARD_STATUS = { PENDING: 0, ACTIVE: 1, DISABLED: 2, FAILED: 3 }`
  - `FORWARD_LIMITS = { maxTargets: 3, codeTtlMs: 1800000, maxCodeFails: 5, maxSendFails: 10, targetCooldownSec: 60, dailyVerifyLimit: 10, lastErrorMaxLen: 500 }`
  - `normalizeEmail(str: string) => string`：trim + 小写，非字符串返回 `''`
  - `validateTarget({ target, accountEmail, domainList, existingTargets }) => string | null`：返回 i18n 错误 key 或 `null`。`domainList` 形如 `['@example.com']`；`existingTargets` 是该账号已有的目标地址数组。判断顺序：格式 `notEmail` → 站内域名 `forwardTargetInternal` → 等于账号自身 `forwardTargetSelf` → 数量 `forwardTargetLimit` → 重复 `forwardTargetExists`。域名和地址比较一律不区分大小写。
  - `genVerifyCode() => string`：用 `globalThis.crypto.getRandomValues`，6 位数字，左补零。
  - `checkVerifyCode(row, input, nowMs) => 'ok' | 'wrong' | 'invalid'`：`row` 有 `verifyCode`、`verifyExpireTime`（ISO 字符串）、`verifyFailCount`。无验证码、已过期、失败次数已达 5 次返回 `'invalid'`；`input` trim 后不等返回 `'wrong'`。
  - `afterWrongCode(row) => { verifyFailCount, verifyCode }`：次数加一，达到 5 时 `verifyCode` 置为 `''`。
  - `afterSendFailure(row, message) => { failCount, status, lastError }`：`failCount` 加一，达到 10 时 `status = FAILED`，否则保持 `row.status`；`lastError` 截到 500 字符。
  - `pickChannel({ hasCfEmail, resendTokens, accountEmail }) => { type: 'cloudflare' } | { type: 'resend', token } | null`：有 `env.email` 优先；否则按账号域名（小写）查 `resendTokens`。
  - `canUseForward({ isAdmin, permKeys, sendType }) => boolean`
  - `isForwardedMail(rawHeaders) => boolean`：`rawHeaders` 是 postal-mime 的 `[{ key, value }]`（`key` 已小写），可为 `undefined`。
  - `sanitizeDisplayName(name) => string`：去掉 `" , < > ; : \ @ ( ) [ ]` 和换行，合并空白并 trim。
  - `buildForwardParams({ accountEmail, target, subject, html, text, fromAddress, fromName, attachments }) => sendParams`：返回给 `emailService.sendByCloudflareEmail` / `sendByResend` 的参数对象，字段 `accountEmail, name, receiveEmail, subject, html, text, attachments, headers`，有原发件人地址时再加 `replyTo`。

- [ ] **Step 1: 配置单测运行**

`mail-worker/vitest.unit.config.js`：`defineConfig({ test: { include: ['test/unit/**/*.spec.js'], environment: 'node' } })`（从 `vitest/config` 导入）。`package.json` 的 scripts 加 `"test:unit": "vitest run --config vitest.unit.config.js"`。然后：

Run: `cd mail-worker && pnpm install`
Expected: 安装成功，`node_modules/.bin/vitest` 存在。

- [ ] **Step 2: 写失败的测试**

`mail-worker/test/unit/forward-rules.spec.js`：

```js
import { describe, it, expect } from 'vitest';
import {
	FORWARD_STATUS, validateTarget, genVerifyCode, checkVerifyCode, afterWrongCode,
	afterSendFailure, pickChannel, canUseForward, isForwardedMail, sanitizeDisplayName, buildForwardParams
} from '../../src/lib/forward-rules.js';

const domainList = ['@example.com', '@example2.com'];
const base = { accountEmail: 'alice@example.com', domainList, existingTargets: [] };

describe('validateTarget', () => {
	it('接受外部地址', () => expect(validateTarget({ ...base, target: 'me@gmail.com' })).toBeNull());
	it('拒绝非法格式', () => expect(validateTarget({ ...base, target: 'not-an-email' })).toBe('notEmail'));
	it('站内域名不区分大小写并忽略空格', () =>
		expect(validateTarget({ ...base, target: '  Bob@EXAMPLE2.com ' })).toBe('forwardTargetInternal'));
	it('拒绝账号自身（域名已不在站内列表时）', () =>
		expect(validateTarget({ ...base, accountEmail: 'alice@old.com', target: 'ALICE@old.com' })).toBe('forwardTargetSelf'));
	it('第 4 个被拒', () =>
		expect(validateTarget({ ...base, existingTargets: ['a@x.com', 'b@x.com', 'c@x.com'], target: 'd@x.com' })).toBe('forwardTargetLimit'));
	it('重复不区分大小写', () =>
		expect(validateTarget({ ...base, existingTargets: ['me@gmail.com'], target: 'ME@Gmail.com' })).toBe('forwardTargetExists'));
});

describe('verify code', () => {
	const now = Date.parse('2026-11-11T00:00:00Z');
	const row = { verifyCode: '123456', verifyExpireTime: '2026-11-11T00:30:00.000Z', verifyFailCount: 0 };
	it('生成 6 位数字', () => { for (let i = 0; i < 100; i++) expect(genVerifyCode()).toMatch(/^\d{6}$/); });
	it('正确码（含空格）', () => expect(checkVerifyCode(row, ' 123456 ', now)).toBe('ok'));
	it('错误码', () => expect(checkVerifyCode(row, '654321', now)).toBe('wrong'));
	it('过期', () => expect(checkVerifyCode(row, '123456', Date.parse('2026-11-11T00:30:00.001Z'))).toBe('invalid'));
	it('已清空', () => expect(checkVerifyCode({ ...row, verifyCode: '' }, '', now)).toBe('invalid'));
	it('已锁定', () => expect(checkVerifyCode({ ...row, verifyFailCount: 5 }, '123456', now)).toBe('invalid'));
	it('第 4 次错只计数', () => expect(afterWrongCode({ verifyFailCount: 3, verifyCode: '123456' })).toEqual({ verifyFailCount: 4, verifyCode: '123456' }));
	it('第 5 次错作废', () => expect(afterWrongCode({ verifyFailCount: 4, verifyCode: '123456' })).toEqual({ verifyFailCount: 5, verifyCode: '' }));
});

describe('afterSendFailure', () => {
	it('未到上限保持状态', () =>
		expect(afterSendFailure({ failCount: 8, status: FORWARD_STATUS.ACTIVE }, 'boom')).toEqual({ failCount: 9, status: FORWARD_STATUS.ACTIVE, lastError: 'boom' }));
	it('第 10 次自动停用', () =>
		expect(afterSendFailure({ failCount: 9, status: FORWARD_STATUS.ACTIVE }, 'boom').status).toBe(FORWARD_STATUS.FAILED));
	it('错误信息截断', () =>
		expect(afterSendFailure({ failCount: 0, status: 1 }, 'x'.repeat(600)).lastError).toHaveLength(500));
});

describe('pickChannel', () => {
	it('优先 Cloudflare', () => expect(pickChannel({ hasCfEmail: true, resendTokens: {}, accountEmail: 'a@example.com' })).toEqual({ type: 'cloudflare' }));
	it('按域名取 Resend', () =>
		expect(pickChannel({ hasCfEmail: false, resendTokens: { 'example.com': 're_x' }, accountEmail: 'a@Example.com' })).toEqual({ type: 'resend', token: 're_x' }));
	it('都没有', () => expect(pickChannel({ hasCfEmail: false, resendTokens: {}, accountEmail: 'a@example.com' })).toBeNull());
});

describe('canUseForward', () => {
	it('管理员不受限', () => expect(canUseForward({ isAdmin: true, permKeys: [], sendType: 'ban' })).toBe(true));
	it('有权限可用', () => expect(canUseForward({ isAdmin: false, permKeys: ['account:forward'], sendType: 'count' })).toBe(true));
	it('无权限', () => expect(canUseForward({ isAdmin: false, permKeys: [], sendType: 'count' })).toBe(false));
	it('禁止发信', () => expect(canUseForward({ isAdmin: false, permKeys: ['account:forward'], sendType: 'ban' })).toBe(false));
	it('只能站内', () => expect(canUseForward({ isAdmin: false, permKeys: ['account:forward'], sendType: 'internal' })).toBe(false));
});

describe('isForwardedMail', () => {
	it('有标记', () => expect(isForwardedMail([{ key: 'x-cloudmail-forwarded', value: '1' }])).toBe(true));
	it('无标记', () => expect(isForwardedMail([{ key: 'subject', value: 'hi' }])).toBe(false));
	it('无信头', () => expect(isForwardedMail(undefined)).toBe(false));
});

describe('display name and params', () => {
	it('清洗显示名', () => {
		expect(sanitizeDisplayName('GitHub, Inc. <noreply>')).toBe('GitHub Inc. noreply');
		expect(sanitizeDisplayName('  "Bob"\r\n ')).toBe('Bob');
		expect(sanitizeDisplayName(undefined)).toBe('');
	});
	it('无主题、无发件人时回退', () => {
		expect(buildForwardParams({
			accountEmail: 'alice@example.com', target: 'me@gmail.com', subject: '', html: '<p>hi</p>', text: 'hi',
			fromAddress: '', fromName: '', attachments: []
		})).toEqual({
			accountEmail: 'alice@example.com', name: 'alice', receiveEmail: ['me@gmail.com'], subject: '(no subject)',
			html: '<p>hi</p>', text: 'hi', attachments: [],
			headers: { 'X-CloudMail-Forwarded': '1', 'X-CloudMail-Forwarded-For': 'alice@example.com' }
		});
	});
	it('正常来信', () => {
		const p = buildForwardParams({
			accountEmail: 'alice@example.com', target: 'me@gmail.com', subject: 'Hello', html: '', text: 'hi',
			fromAddress: 'noreply@github.com', fromName: 'GitHub, Inc.', attachments: []
		});
		expect(p.name).toBe('GitHub Inc.');
		expect(p.replyTo).toBe('noreply@github.com');
		expect(p.subject).toBe('Hello');
	});
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd mail-worker && pnpm test:unit`
Expected: FAIL，提示无法解析 `../../src/lib/forward-rules.js`。

- [ ] **Step 4: 实现 `mail-worker/src/lib/forward-rules.js`**

按上面 Interfaces 的签名实现。`buildForwardParams` 的 `name` 回退顺序：`sanitizeDisplayName(fromName)` → `fromAddress` → `emailUtils.getName(accountEmail)`；`fromAddress` 为空时不要输出 `replyTo` 键。`genVerifyCode` 用一个 `Uint32Array(1)` 取模 `1000000` 后 `padStart(6, '0')`。

- [ ] **Step 5: 运行测试确认通过**

Run: `cd mail-worker && pnpm test:unit`
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add mail-worker/vitest.unit.config.js mail-worker/package.json mail-worker/pnpm-lock.yaml mail-worker/src/lib/forward-rules.js mail-worker/test/unit/forward-rules.spec.js
git commit -m "feat(forward): add forwarding rules module with unit tests"
```

---

### Task 2: 发信函数支持 Reply-To 和自定义信头

**Files:**
- Create: `mail-worker/src/lib/send-headers.js`
- Modify: `mail-worker/src/service/email-service.js`（`sendByCloudflareEmail` 约 659 行、`sendByResend` 约 695 行、`sendBatchByResend` 约 640 行）
- Test: `mail-worker/test/unit/send-headers.spec.js`

**Interfaces:**
- Consumes: 无
- Produces:
  - `buildSendHeaders(params) => object | undefined`：合并 `params.headers`；当 `params.sendType === 'reply'` 且 `params.messageId` 非空时再加 `'in-reply-to'` 和 `'references'`。结果为空对象时返回 `undefined`。
  - `emailService.sendByCloudflareEmail(c, params)` 和 `emailService.sendByResend(resendToken, params)` 新增可选入参 `params.replyTo: string` 和 `params.headers: object`。两者都用 `sendForm.replyTo = params.replyTo`（Cloudflare Email Service 和 Resend v6 字段名都是 `replyTo`）。返回值不变：Cloudflare 成功返回 `{ data: { id } }`、失败抛错；Resend 返回 `{ data, error }`。

- [ ] **Step 1: 写失败的测试**

```js
import { describe, it, expect } from 'vitest';
import { buildSendHeaders } from '../../src/lib/send-headers.js';

describe('buildSendHeaders', () => {
	it('无任何信头', () => expect(buildSendHeaders({})).toBeUndefined());
	it('回复邮件', () =>
		expect(buildSendHeaders({ sendType: 'reply', messageId: '<m@x>' })).toEqual({ 'in-reply-to': '<m@x>', references: '<m@x>' }));
	it('回复但没有 messageId', () => expect(buildSendHeaders({ sendType: 'reply' })).toBeUndefined());
	it('合并自定义信头', () =>
		expect(buildSendHeaders({ headers: { 'X-A': '1' }, sendType: 'reply', messageId: '<m@x>' }))
			.toEqual({ 'X-A': '1', 'in-reply-to': '<m@x>', references: '<m@x>' }));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd mail-worker && pnpm test:unit`
Expected: `send-headers.spec.js` FAIL，模块不存在。

- [ ] **Step 3: 实现 `buildSendHeaders` 并替换三处发送函数里手写的 `in-reply-to` 逻辑**

三个函数都改为 `const headers = buildSendHeaders(params); if (headers) sendForm.headers = headers;`。`sendByCloudflareEmail` 和 `sendByResend` 另加 `if (params.replyTo) sendForm.replyTo = params.replyTo;`。注意：原 `sendByResend` 在 `sendType === 'reply'` 时不检查 `messageId` 就加信头，现在没有 `messageId` 就不加，这是有意的修正。

- [ ] **Step 4: 运行确认通过**

Run: `cd mail-worker && pnpm test:unit`
Expected: 全部 PASS。

- [ ] **Step 5: 回归检查普通发信**

按"本地验证环境"启动后，用前端或接口以管理员身份给一个外部地址发一封普通邮件、回复一封邮件。
Expected: wrangler 日志里普通邮件没有 `headers`；回复邮件带 `in-reply-to` 和 `references`。

- [ ] **Step 6: Commit**

```bash
git add mail-worker/src/lib/send-headers.js mail-worker/test/unit/send-headers.spec.js mail-worker/src/service/email-service.js
git commit -m "feat(send): support replyTo and custom headers in send channels"
```

---

### Task 3: 数据表、设置字段、权限点与迁移

**Files:**
- Create: `mail-worker/src/entity/account-forward.js`
- Modify: `mail-worker/src/entity/setting.js`（末尾加 `userForward`）
- Modify: `mail-worker/src/const/entity-const.js`（`settingConst` 加 `userForward: { OPEN: 0, CLOSE: 1 }`）
- Modify: `mail-worker/src/const/kv-const.js`（加两个 key）
- Modify: `mail-worker/src/init/init.js`（新增 `v3_5DB`，在 `init()` 里 `v3_4DB` 之后调用）
- Modify: `mail-worker/src/i18n/zh.js`、`en.js`（`perms` 加 `"邮箱转发"`）
- Modify: `mail-worker/src/service/setting-service.js`（`websiteConfig` 返回 `userForward`）
- Modify: `mail-worker/src/service/account-service.js`（`physicsDelete`、`physicsDeleteByUserIds` 级联删除）

**Interfaces:**
- Consumes: 无
- Produces:
  - Drizzle 实体 `accountForward`（默认导出，同时具名导出），表名 `account_forward`，字段 camelCase：`forwardId, accountId, userId, targetEmail, status, verifyCode, verifyExpireTime, verifySendTime, verifyFailCount, failCount, lastError, createTime`，列名与默认值见设计文档 6.1。
  - `setting.userForward`（列 `user_forward`，默认 `1`）；`settingConst.userForward.OPEN = 0`、`CLOSE = 1`。
  - `KvConst.FORWARD_VERIFY_TARGET = 'forward_verify_target:'`、`KvConst.FORWARD_VERIFY_DAY = 'forward_verify_day:'`。
  - `websiteConfig` 响应新增 `userForward`。

- [ ] **Step 1: 写实体、常量、设置字段、KV key**

- [ ] **Step 2: 写 `v3_5DB`**

每条语句单独 try/catch，失败时 `console.warn('跳过字段：' + e.message)`，与现有迁移一致：

```sql
CREATE TABLE IF NOT EXISTS account_forward (
	forward_id INTEGER PRIMARY KEY AUTOINCREMENT,
	account_id INTEGER NOT NULL,
	user_id INTEGER NOT NULL,
	target_email TEXT NOT NULL,
	status INTEGER NOT NULL DEFAULT 0,
	verify_code TEXT NOT NULL DEFAULT '',
	verify_expire_time TEXT,
	verify_send_time TEXT,
	verify_fail_count INTEGER NOT NULL DEFAULT 0,
	fail_count INTEGER NOT NULL DEFAULT 0,
	last_error TEXT NOT NULL DEFAULT '',
	create_time TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_account_forward_account ON account_forward(account_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_forward_unique ON account_forward(account_id, target_email COLLATE NOCASE);
ALTER TABLE setting ADD COLUMN user_forward INTEGER NOT NULL DEFAULT 1;
INSERT INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES (37, '邮箱转发', 'account:forward', 21, 2, 3);
```

- [ ] **Step 3: 权限翻译、`websiteConfig`、级联删除**

`perms` 里 zh `"邮箱转发": "邮箱转发"`，en `"邮箱转发": "Mail forwarding"`。`physicsDelete` 删除 `account_forward` 中 `account_id = accountId` 的行；`physicsDeleteByUserIds` 删除 `user_id IN userIds` 的行。

- [ ] **Step 4: 验证迁移**

按"本地验证环境"启动，访问 init 地址两次。
Expected: 两次都返回 `success`。

Run: `npx wrangler d1 execute email --local --config wrangler-dev.toml --command "SELECT perm_key FROM perm WHERE perm_id = 37; SELECT user_forward FROM setting; PRAGMA index_list(account_forward);"`
Expected: `account:forward`；`1`；两个索引 `idx_account_forward_account`、`idx_account_forward_unique`。

Run: `curl -s http://127.0.0.1:8787/api/setting/websiteConfig | jq .data.userForward`
Expected: `1`

- [ ] **Step 5: Commit**

```bash
git add mail-worker/src/entity/account-forward.js mail-worker/src/entity/setting.js mail-worker/src/const mail-worker/src/init/init.js mail-worker/src/i18n mail-worker/src/service/setting-service.js mail-worker/src/service/account-service.js
git commit -m "feat(forward): add account_forward table, setting switch and permission"
```

---

### Task 4: 转发配置接口与验证邮件

**Files:**
- Create: `mail-worker/src/service/forward-service.js`
- Create: `mail-worker/src/template/forward-verify.js`
- Create: `mail-worker/src/api/forward-api.js`
- Modify: `mail-worker/src/hono/webs.js`（import `'../api/forward-api'`）
- Modify: `mail-worker/src/security/security.js`（`requirePerms` 加 6 个路径；`premKey` 加 `'account:forward'`）
- Modify: `mail-worker/src/i18n/zh.js`、`en.js`（错误文案）

**Interfaces:**
- Consumes: Task 1 的 `FORWARD_STATUS`、`FORWARD_LIMITS`、`normalizeEmail`、`validateTarget`、`genVerifyCode`、`checkVerifyCode`、`afterWrongCode`、`pickChannel`、`canUseForward`；Task 2 的 `emailService.sendByCloudflareEmail(c, params)` / `sendByResend(token, params)`；Task 3 的 `accountForward` 实体、`settingConst.userForward`、`KvConst.FORWARD_VERIFY_*`。
- Produces（`forwardService` 默认导出对象）：
  - `list(c, { accountId }, userId) => row[]`：不含 `verifyCode` 字段，按 `forwardId` 升序。
  - `add(c, { accountId, targetEmail }, userId, lang) => row`
  - `verify(c, { forwardId, code }, userId) => void`
  - `resendCode(c, { forwardId }, userId, lang) => void`
  - `setStatus(c, { forwardId, status }, userId) => void`：只接受 `1` 或 `2`，只作用于状态为 `1`、`2`、`3` 的记录；切到 `1` 时清零 `failCount` 和 `lastError`。待验证记录返回 `forwardNotVerified`。
  - `remove(c, { forwardId }, userId) => void`
  - `deliver(c, channel, params) => Promise<void>`：按 `pickChannel` 的结果调用对应发送函数；Resend 返回 `error` 时抛 `Error(error.message)`，统一用抛错表示失败。Task 5 复用。
  - `forwardVerifyTemplate({ accountEmail, code, lang }) => { subject, text, html }`（`template/forward-verify.js` 默认导出）。
- 路由（全部 `result.ok(...)` 包装，入参与设计文档 7.2 一致）：`GET /forward/list`（query）、`POST /forward/add`、`POST /forward/verify`、`POST /forward/resendCode`、`PUT /forward/setStatus`、`DELETE /forward/delete`（query `forwardId`）。`lang` 在 API 层取：`c.req.header('accept-language')?.split('-')[0] === 'en' ? 'en' : 'zh'`。

- [ ] **Step 1: 加错误文案**

| key | zh | en |
|---|---|---|
| forwardDisabled | 转发功能未开启 | Mail forwarding is disabled |
| forwardNoPerm | 你的身份不允许使用转发 | Your role is not allowed to forward mail |
| forwardTargetInternal | 不能转发到本站域名的邮箱 | Cannot forward to an address on this site |
| forwardTargetSelf | 不能转发到邮箱自身 | Cannot forward to the mailbox itself |
| forwardTargetLimit | 每个邮箱最多添加 3 个转发地址 | Up to 3 forwarding addresses per mailbox |
| forwardTargetExists | 该转发地址已添加 | This forwarding address already exists |
| forwardNoProvider | 该域名未配置发信渠道，无法开启转发 | No sending provider is configured for this domain |
| forwardVerifyTooFrequent | 请稍后再试 | Please try again later |
| forwardVerifyDayLimit | 今日验证邮件次数已达上限 | Daily verification email limit reached |
| forwardCodeWrong | 验证码错误 | Incorrect verification code |
| forwardCodeInvalid | 验证码已失效，请重新发送 | The code has expired, please resend |
| forwardNotExist | 转发地址不存在 | Forwarding address not found |
| forwardNotVerified | 转发地址尚未验证 | Forwarding address is not verified |

- [ ] **Step 2: 写验证邮件模板**

固定文案（`html` 为同样三行，各包一个 `<p>`，验证码加粗）：

- zh 主题 `验证转发邮箱`；正文：`${accountEmail} 申请把收到的邮件转发到这个地址。` / `验证码：${code}，30 分钟内有效。` / `如果不是你本人操作，请忽略这封邮件。`
- en 主题 `Verify your forwarding address`；正文：`${accountEmail} requested to forward incoming mail to this address.` / `Verification code: ${code} (valid for 30 minutes).` / `If you did not request this, please ignore this email.`

- [ ] **Step 3: 实现 `forwardService` 的配置方法**

公共前置（`add`、`resendCode`、`verify`、`setStatus`、`list`、`remove` 都做）：用 `accountService.selectById` 取账号（排除已删除），不存在或 `userId` 不符抛 `BizError(t('noUserAccount'))`；按 `forwardId` 操作的方法先查记录并确认 `userId` 一致，否则 `forwardNotExist`。

`add` 依次检查：`userForward` 关 → `forwardDisabled`；非管理员且 `canUseForward` 为假 → `forwardNoPerm`（权限用 `permService.userPermKeys`，`sendType` 用 `roleService.selectByUserId`）；`validateTarget` 非空 → 对应 key（`existingTargets` 取该账号全部记录）；`pickChannel` 为空 → `forwardNoProvider`；限频（见下）。通过后插入 `status = 0`、验证码、`verifyExpireTime = new Date(Date.now() + codeTtlMs).toISOString()`、`verifySendTime = new Date().toISOString()`，再发验证邮件。**发信失败时删除刚插入的记录并抛出原错误**，避免留下收不到码的待验证记录。

限频（`add` 和 `resendCode` 共用一个内部函数）：KV `FORWARD_VERIFY_TARGET + 小写地址` 存在 → `forwardVerifyTooFrequent`；KV `FORWARD_VERIFY_DAY + userId + ':' + dayjs().format('YYYY-MM-DD')` 计数已达 10 → `forwardVerifyDayLimit`。发信成功后写目标 key（`expirationTtl: 60`）并把日计数加一（`expirationTtl: 86400`）。

验证邮件的发送参数：`{ accountEmail: accountRow.email, name: accountRow.name || emailUtils.getName(accountRow.email), receiveEmail: [target], subject, text, html }`，后三项来自模板，经 `deliver` 发出。

`resendCode`：记录不是待验证状态时直接返回，不发信（前端只对待验证记录显示"重发"）。否则先过限频，再重置 `verifyCode`、`verifyExpireTime`、`verifySendTime`、`verifyFailCount = 0` 并发信。

`verify`：记录不是待验证状态时直接返回。否则 `checkVerifyCode` 结果为 `'ok'` → 更新 `status = 1`、`verifyCode = ''`、`verifyFailCount = 0`；`'wrong'` → 写入 `afterWrongCode` 的结果后抛 `forwardCodeWrong`；`'invalid'` → 抛 `forwardCodeInvalid`。

- [ ] **Step 4: 写路由、注册到 `webs.js`、加权限映射**

`requirePerms` 追加 `'/forward/list', '/forward/add', '/forward/verify', '/forward/resendCode', '/forward/setStatus', '/forward/delete'`，`premKey` 追加 `'account:forward': [同上 6 个路径]`。

- [ ] **Step 5: 手工验证**

按"本地验证环境"启动（`env.email` 已临时启用）。先打开总开关并给管理员加一个外部发件可用的账号（管理员默认账号 `admin@example.com` 即可，accountId 用 `GET /api/account/list` 查）。

```bash
curl -s -X PUT http://127.0.0.1:8787/api/setting/set -H "Authorization: $TOKEN" -H 'content-type: application/json' -d '{"userForward":0}'
```

逐项确认（每条都用 `curl` 调对应接口）：

1. 添加 `me@gmail.com` → 成功，wrangler 日志出现主题为"验证转发邮箱"的邮件和 6 位验证码；`list` 返回一条 `status: 0` 且没有 `verifyCode` 字段。
2. 立刻再添加 `ME@gmail.com` → `该转发地址已添加`。
3. 删除后 60 秒内再添加 `me@gmail.com` → `请稍后再试`。
4. 添加 `x@example2.com` → `不能转发到本站域名的邮箱`。
5. 添加第 4 个地址 → `每个邮箱最多添加 3 个转发地址`。
6. `verify` 错码 → `验证码错误`；连续 5 次后用正确码 → `验证码已失效，请重新发送`；`resendCode` 后用新码 → 成功，`status: 1`。
7. `setStatus` 为 `2` 再为 `1` → 成功；对待验证记录 `setStatus` → `转发地址尚未验证`。
8. 关闭总开关后再添加 → `转发功能未开启`。
9. 用 `curl` 加 `-H 'accept-language: en'` 触发任一错误 → 返回英文文案。

- [ ] **Step 6: Commit**

```bash
git add mail-worker/src/service/forward-service.js mail-worker/src/template/forward-verify.js mail-worker/src/api/forward-api.js mail-worker/src/hono/webs.js mail-worker/src/security/security.js mail-worker/src/i18n
git commit -m "feat(forward): add forwarding config API with verification"
```

---

### Task 5: 收件时自动转发

**Files:**
- Modify: `mail-worker/src/service/forward-service.js`（新增 `forwardReceived`）
- Modify: `mail-worker/src/email/email.js`（`completeReceive` 之后、`ruleType === RULE` 判断之前调用）
- Modify: `mail-worker/src/service/email-service.js`（`forwardOnSiteEmail` 开头、按 `ruleEmail` 过滤之前调用）
- Create: `mail-worker/test/fixtures/forward-sample.eml`
- Create: `mail-worker/test/fixtures/forward-loop.eml`

**Interfaces:**
- Consumes: Task 1 的 `isForwardedMail`、`canUseForward`、`pickChannel`、`buildForwardParams`、`afterSendFailure`、`FORWARD_STATUS`；Task 4 的 `forwardService.deliver(c, channel, params)`；`emailService.toCloudflareAttachments` / `toResendAttachments` 由发送函数内部处理，调用方传原始附件即可。
- Produces: `forwardService.forwardReceived(c, emailRow, message) => Promise<void>`，**永不抛错**。`message = { subject, html, text, fromAddress, fromName, attachments, rawHeaders }`。

调用点传参：

- `email.js`：`emailRow` 为 `completeReceive` 的返回值；`message` 取 `email.subject`、`email.html`、`email.text`、`email.from?.address || ''`、`email.from?.name || ''`、`email.attachments`、`email.headers`。用 `{ env }` 作为 `c`。
- `forwardOnSiteEmail`：对 `emailRowList` 中每条调用，`message` 取 `sendParams.subject`、`sendParams.html`、`sendParams.text`、`sendParams.accountEmail`、`sendParams.name`、`sendParams.attachments`、`rawHeaders: []`。

- [ ] **Step 1: 写测试邮件**

`forward-sample.eml`：`From: "GitHub, Inc." <noreply@github.test>`，`To: admin@example.com`，主题 `Forward test`，`multipart/mixed` 内含 `multipart/related`（HTML 正文引用 `cid:logo1` 的一张小 PNG，`Content-ID: <logo1>`）和一个 `hello.txt` 附件。`forward-loop.eml`：同上精简版，额外带信头 `X-CloudMail-Forwarded: 1`。

- [ ] **Step 2: 实现 `forwardReceived`**

按设计文档 7.4 的 1 到 9 步。补充：

- 第 1 步的状态判断用 `emailRow.status === emailConst.status.RECEIVE`。
- 第 5 步：用户用 `userService.selectByIdIncludeDel`，`isDel` 或 `status === userConst.status.BAN` 时返回；账号用 `accountService.selectById`（已排除删除）。
- 第 6 步无渠道时，把所有启用记录的 `lastError` 更新为 `'no send provider'`，不增加 `failCount`。
- 第 8 步每个目标：成功后若原 `failCount > 0` 则更新 `failCount = 0`、`lastError = ''`；失败写入 `afterSendFailure(row, e.message)` 的结果，并 `console.error('转发邮箱 ' + target + ' 失败：', e)`。

- [ ] **Step 3: 接入两个调用点**

- [ ] **Step 4: 手工验证**

先完成 Task 4 验证第 6 步，使 `admin@example.com` 有一条 `status = 1` 的转发记录。

1. 投递 `forward-sample.eml` → wrangler 日志里出现一封发往 `me@gmail.com` 的邮件：`from.email` 是 `admin@example.com`、`from.name` 是 `GitHub Inc.`、`replyTo` 是 `noreply@github.test`、主题 `Forward test`、HTML 含 `cid:logo1`、附件 2 个（PNG inline 带 `contentId: logo1`、`hello.txt` attachment）、信头含 `X-CloudMail-Forwarded: 1`。站内收件箱照常有这封信。
2. 投递 `forward-loop.eml` → 站内照常收到，日志里**没有**转发。
3. 用另一个站内账号给 `admin@example.com` 发站内信 → 同样转发到 `me@gmail.com`。
4. 失败隔离：把 `wrangler-dev.toml` 的 `[[send_email]] name = "email"` 再注释回去，在系统设置里给 `example.com` 填一个无效 Resend token（如 `re_invalid`），重启后投递 `forward-sample.eml` 10 次 → 每次站内都照常收到；`account_forward` 的 `fail_count` 递增到 `10` 后 `status` 变为 `3`，`last_error` 有内容；第 11 次不再尝试发送。
5. 开启管理员"规则转发"且规则里不含 `admin@example.com` → 投递后用户转发仍然执行。

- [ ] **Step 5: Commit**

```bash
git add mail-worker/src/service/forward-service.js mail-worker/src/email/email.js mail-worker/src/service/email-service.js mail-worker/test/fixtures
git commit -m "feat(forward): forward received mail to verified addresses"
```

---

### Task 6: 前端系统设置总开关

**Files:**
- Modify: `mail-vue/src/views/sys-setting/index.vue`（"邮件推送"卡片，"第三方邮箱"那一行之后）
- Modify: `mail-vue/src/i18n/zh.js`、`en.js`

**Interfaces:**
- Consumes: `setting.userForward`（`/setting/query` 已返回）、现有 `editSetting(form)` 保存函数。
- Produces: 前端文案 key `userForward`、`userForwardDesc`（Task 7 不依赖）。

- [ ] **Step 1: 加一行 `setting-item`**

左侧标题 `$t('userForward')` 加 `fe:warning` 图标的 tooltip `$t('userForwardDesc')`；右侧一个 `el-switch`，`:active-value="0" :inactive-value="1"`，`@change` 时调用 `editSetting({ userForward })`。文案：zh `用户自助转发` / `允许用户把自己的邮箱自动转发到外部地址，转发会消耗发信额度`；en `User forwarding` / `Let users auto-forward their mailboxes to external addresses. Forwarding uses your sending quota.`

- [ ] **Step 2: 构建并手工验证**

Run: `cd mail-vue && pnpm install && pnpm build`
Expected: 构建成功。

`pnpm dev` 打开系统设置，切换开关后刷新页面，状态保持；`websiteConfig` 返回值随之变化。

- [ ] **Step 3: Commit**

```bash
git add mail-vue/src/views/sys-setting/index.vue mail-vue/src/i18n
git commit -m "feat(forward): add user forwarding switch to system settings"
```

---

### Task 7: 前端转发设置对话框与侧栏入口

**Files:**
- Create: `mail-vue/src/request/forward.js`
- Create: `mail-vue/src/components/forward-dialog/index.vue`
- Modify: `mail-vue/src/layout/account/index.vue`（下拉菜单、`showNullSetting`、挂载对话框）
- Modify: `mail-vue/src/i18n/zh.js`、`en.js`

**Interfaces:**
- Consumes: Task 4 的 6 个接口；`settingStore.settings.userForward`；`hasPerm('account:forward')`。
- Produces:
  - `request/forward.js` 导出：`forwardList(accountId)`、`forwardAdd(accountId, targetEmail)`、`forwardVerify(forwardId, code)`、`forwardResendCode(forwardId)`、`forwardSetStatus(forwardId, status)`、`forwardDelete(forwardId)`，写法同 `request/account.js`。
  - 组件 `forward-dialog`：`defineExpose({ open(account) })`，`account` 为侧栏的账号对象（需要 `accountId`、`email`）。

- [ ] **Step 1: 写请求封装**

- [ ] **Step 2: 写对话框组件**

按设计文档 5.2 的布局。每行按 `status` 显示：`0` 显示"待验证"和"输入验证码""重发"按钮；`1`/`2` 显示"已验证"和启用开关（切换调 `forwardSetStatus` 为 `1`/`2`）；`3` 显示 `forwardFailed`（带 `failCount`）、`lastError` 作为 tooltip、"重新启用"按钮（`forwardSetStatus(id, 1)`）。每行都有"删除"（`ElMessageBox.confirm` 确认）。添加前用 `@/utils/verify-utils.js` 的 `isEmail` 做前端格式校验；已有 3 条时禁用输入框。添加成功提示 `forwardCodeSent`。成功/失败提示沿用 `ElMessage({ ..., plain: true })`。验证码输入的交互形式由实现者决定。

文案：

| key | zh | en |
|---|---|---|
| forwardSetting | 转发设置 | Forwarding |
| forwardDesc | 收到的邮件会自动转发到以下已验证的邮箱 | Incoming mail is forwarded to the verified addresses below |
| forwardInputDesc | 输入要转发到的邮箱地址 | Enter an address to forward to |
| forwardLimitTip | 最多添加 3 个，站内域名的地址不能作为转发目标 | Up to 3 addresses. Addresses on this site cannot be used. |
| forwardPending | 待验证 | Pending |
| forwardActive | 已验证 | Verified |
| forwardFailed | 已停用，连续失败 {count} 次 | Disabled after {count} failures |
| forwardEnterCode | 输入验证码 | Enter code |
| forwardResend | 重发 | Resend |
| forwardReEnable | 重新启用 | Re-enable |
| forwardCodeSent | 验证码已发送到 {email} | Code sent to {email} |
| forwardDelConfirm | 确认删除这个转发地址吗？ | Delete this forwarding address? |

- [ ] **Step 3: 接入侧栏**

下拉菜单在"重命名"之后加 `<el-dropdown-item v-if="canForward" @click="forwardDialogRef.open(item)">{{ $t('forwardSetting') }}</el-dropdown-item>`，其中 `canForward = computed(() => settingStore.settings.userForward === 0 && hasPerm('account:forward'))`。`showNullSetting(item)` 的条件里追加 `&& !canForward.value`，否则只有转发权限的用户看不到下拉。

- [ ] **Step 4: 构建并手工验证**

Run: `cd mail-vue && pnpm build`
Expected: 构建成功。

`pnpm dev` 后验证：总开关关时任何人看不到入口；开启后管理员可见；新建一个没有 `邮箱转发` 权限的角色，其用户看不到入口；勾选权限后可见。走一遍添加、输错码、重发、验证、停用、启用、删除，界面状态与 `list` 接口一致；切换到英文界面，文案均为英文。

- [ ] **Step 5: Commit**

```bash
git add mail-vue/src/request/forward.js mail-vue/src/components/forward-dialog mail-vue/src/layout/account/index.vue mail-vue/src/i18n
git commit -m "feat(forward): add forwarding dialog to mailbox sidebar"
```

---

### Task 8: 端到端验收

**Files:** 无代码改动（发现问题回到对应 Task 修复）。

**Interfaces:**
- Consumes: Task 1 到 7 的全部产出。
- Produces: 验收记录（贴在 PR 描述里）。

- [ ] **Step 1: 跑单测**

Run: `cd mail-worker && pnpm test:unit`
Expected: 全部 PASS。

- [ ] **Step 2: 前端构建**

Run: `cd mail-vue && pnpm build`
Expected: 构建成功。

- [ ] **Step 3: 按设计文档第 10 节逐条走一遍**

用真实 Resend token 和一个真实外部邮箱（部署到测试环境 `wrangler-test.toml`，或本地配 Resend），重点确认本地模拟无法覆盖的三点：外部邮箱确实收到验证码邮件；收到的转发邮件发件人显示名、回复地址、内嵌图片和附件都正确；在外部邮箱直接回复，回信到达原发件人。

- [ ] **Step 4: 删除账号的级联**

删除一个带转发记录的账号（开启 `syncDelete` 走物理删除）。
Expected: `SELECT COUNT(*) FROM account_forward WHERE account_id = <id>` 为 `0`。

- [ ] **Step 5: 还原本地配置**

确认 `wrangler-dev.toml` 的 `[[send_email]] name = "email"` 已恢复注释，`git status` 里没有它。

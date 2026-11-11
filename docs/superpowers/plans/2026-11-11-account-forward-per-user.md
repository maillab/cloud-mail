# 邮箱转发改为按用户配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已实现的"按邮箱账号"转发改成"按用户"：用户在个人设置里配置一次目标地址，名下所有邮箱收到的邮件都转发过去。

**Architecture:** 表 `account_forward` 替换为 `user_forward`（去掉 `account_id`），服务层所有归属校验改为用户级，收件时按 `emailRow.userId` 查目标；前端把转发对话框改成个人设置页里的内联面板，侧栏入口删除。验证码、限频、权限、转发邮件构造、失败处理全部沿用。

**Tech Stack:** Hono + Drizzle/D1、vitest；Vue 3 + Element Plus。

**Spec:** `docs/superpowers/specs/2026-11-10-account-forward-design.md`，以第 12 节为准（覆盖 5.1、5.2、6.1、7.2、7.4 中冲突的部分）。

**执行前提：** 分支 `feat/account-forward`（已有 12 个提交，HEAD `5bef96e`）。

## Global Constraints

- 表名 `user_forward`，Drizzle 实体 `mail-worker/src/entity/user-forward.js` 导出 `userForward`（默认导出 + 具名导出）；列：`forward_id, user_id, target_email, status, verify_code, verify_expire_time, verify_send_time, verify_fail_count, fail_count, last_error, create_time`，默认值同原表；索引 `idx_user_forward_user(user_id, status)`，唯一索引 `idx_user_forward_unique(user_id, target_email COLLATE NOCASE)`。
- `v3_5DB` 里原 `account_forward` 的三条 DDL 直接替换为上述三条；不保留 `account_forward`（从未发布）。
- 每个用户最多 `3` 个目标地址（任意状态）；其余数值（验证码 6 位 / 30 分钟 / 5 次、限频 60 秒 / 10 封、失败 10 次自动停用、15 秒超时）不变。
- 接口：`GET /forward/list` 无参数；`POST /forward/add {targetEmail}`；`verify / resendCode / setStatus / delete` 入参不变。权限 key 仍为 `account:forward`，`security.js` 不改。
- 错误 key 不变；去掉对 `noUserAccount` 的使用；用户不存在时抛 `BizError(t('notExistUser'))`（该 key 已存在于后端 i18n）。
- 验证邮件发件人 = `userRow.email`，显示名 = 主邮箱账号行的 `name`，为空取地址本地部分。
- 转发出去的邮件发件人 = 收信的那个邮箱（`accountRow.email`），渠道按它的域名选。
- 前端入口只在个人设置页；侧栏邮箱下拉菜单恢复到加转发之前的样子（`showNullSetting` 条件也恢复）。
- 面板显示条件：`settingStore.settings.userForward === 0 && hasPerm('account:forward')`。
- 文案：`forwardSetting` zh `邮件转发` / en `Mail forwarding`；`forwardDesc` zh `你名下所有邮箱收到的邮件都会自动转发到以下已验证的邮箱` / en `Mail received by any of your mailboxes is forwarded to the verified addresses below`。其余 key 不变。
- 任何转发错误都不能让收件流程抛异常（不变）。

## Review Focus

1. **用户有多个邮箱时每封信只转一次、且用对的发件人**：两封分别投到 `admin@` 和 `temp@` 的信，各自转发一次，From 分别是 `admin@` 和 `temp@`。Task 1 本地验证覆盖。
2. **删除单个邮箱不影响转发**：删掉 `temp@` 后，`admin@` 的来信照常转发。Task 1 本地验证覆盖。
3. **旧的本地数据库里有 `account_forward` 表时**，迁移不报错、功能不受影响（`CREATE TABLE IF NOT EXISTS user_forward` 与旧表无关）。Task 1 本地验证：在已跑过旧迁移的库上再跑一次 init。
4. **并发添加仍以用户为单位限 3 个**：6 个并发 add 只成功 3 个。Task 1 本地验证覆盖。
5. **个人设置页在无权限或总开关关时不渲染面板**，且页面其它区块不受影响。Task 2 本地验证覆盖。

---

### Task 1: 后端改为按用户

**Files:**
- Delete: `mail-worker/src/entity/account-forward.js`
- Create: `mail-worker/src/entity/user-forward.js`
- Modify: `mail-worker/src/init/init.js`（`v3_5DB`）
- Modify: `mail-worker/src/service/forward-service.js`
- Modify: `mail-worker/src/api/forward-api.js`
- Modify: `mail-worker/src/service/account-service.js`（级联）
- Modify: `mail-worker/src/email/email.js`、`mail-worker/src/service/email-service.js`（仅当调用签名需要调整；`forwardReceived(c, emailRow, message)` 签名不变则不改）

**Interfaces:**
- Consumes: `lib/forward-rules.js` 不变。
- Produces: `forwardService.list(c, userId)`、`add(c, { targetEmail }, userId, lang)`、其余签名不变；`userForward` 实体。

- [ ] **Step 1: 实体与迁移**

按全局约束写 `user-forward.js`；`v3_5DB` 中替换三条 DDL；删除 `account-forward.js` 并修正所有 import（`forward-service.js`、`account-service.js`）。

- [ ] **Step 2: 服务层**

- `getOwnAccount` 删除；新增 `getOwnUser(c, userId)`：`userService.selectById`，不存在抛 `notExistUser`，返回 `userRow`。
- `getOwnForward(c, forwardId, userId)`：只校验 `row.userId === userId`，返回 `{ row }`。
- `list(c, userId)`：按 `userId` 查，`listColumns` 不含 `verifyCode`，按 `forwardId` 升序。
- `add(c, { targetEmail }, userId, lang)`：`getOwnUser` → `assertCanForward` → `existing` 按 `userId` → `validateTarget({ accountEmail: userRow.email, … })` → `pickChannel({ accountEmail: userRow.email })` → `reserveVerifySend` → `insertWithinLimit({ userId, … })`（`COUNT(*) WHERE user_id = ?` `< 3`）→ 发验证邮件（失败回滚删除行）。
- `sendVerifyMail(c, channel, userRow, target, code, lang)`：发件人 `userRow.email`，显示名取 `accountService.selectByEmailIncludeDel(c, userRow.email)?.name || emailUtils.getName(userRow.email)`。
- `resendCode`：用 `getOwnForward` + `getOwnUser`，渠道按 `userRow.email`。
- `verify / setStatus / remove`：只换实体和归属校验。
- `forwardReceived`：查询条件改为 `eq(userForward.userId, emailRow.userId)`；`accountRow = accountService.selectById(c, emailRow.accountId)`，不存在则返回；用户与角色检查不变；无渠道时更新 `lastError` 的 where 也改为按 `userId`。
- `clearVerifyQuota`、`reserveVerifySend`、`recordSendFailure`、`deliver` 不变（`recordSendFailure` 只换实体）。

- [ ] **Step 3: API 与级联**

`forward-api.js`：`list` 不读 query，`add` 只取 `targetEmail`。`account-service.js`：`physicsDeleteByUserIds` 改为删 `userForward` by `userId`；`physicsDelete`（删单个邮箱）去掉转发删除。

- [ ] **Step 4: 单测仍通过**

Run: `cd mail-worker && pnpm test:unit`
Expected: 45/45 PASS（纯逻辑未改）。

- [ ] **Step 5: 本地验证**

按原计划的"本地验证环境"（临时启用 `[[send_email]] name = "email"`，验证完恢复）。用一个已经跑过旧迁移的本地库（如果 `.wrangler/state` 里还有，直接用；否则先用旧提交 `5bef96e` 的 init 跑一次再切回）再跑 init，确认返回 `success` 且 `user_forward` 表存在。然后：
1. 管理员开总开关，`GET /forward/list` 返回 `[]`；`POST /forward/add {"targetEmail":"me@gmail.com"}` 成功；验证；`list` 为 `status: 1`。
2. 开多邮箱，添加 `temp@example.com`；向 `admin@` 和 `temp@` 各投一封 `sample.eml`：日志里两封转发邮件，From 分别为 `admin@example.com` 和 `temp@example.com`，To 都是 `me@gmail.com`。
3. 删除 `temp@`（物理删除开启）后再向 `admin@` 投递：仍转发；`user_forward` 行仍在。
4. 6 个并发 `add` 不同地址：总共最多 3 行。
5. 删除用户（物理删除）：`user_forward` 行清空。

- [ ] **Step 6: Commit**

```bash
git add mail-worker/src
git commit -m "refactor(forward): scope forwarding targets to the user instead of the mailbox"
```

---

### Task 2: 前端入口移到个人设置

**Files:**
- Modify: `mail-vue/src/request/forward.js`
- Rename/Rewrite: `mail-vue/src/components/forward-dialog/index.vue` → `mail-vue/src/components/forward-panel/index.vue`（内联面板，无 `el-dialog`，挂载时加载列表）
- Modify: `mail-vue/src/views/setting/index.vue`（在"主题样式"区块之后、"通知"区块之前加 `preference-item`：标题 `$t('forwardSetting')`，内容 `<forward-panel/>`，整块 `v-if` 按全局约束的显示条件）
- Modify: `mail-vue/src/layout/account/index.vue`（删除下拉项、组件挂载、import、`forwardDialogRef`、`canForward`，并把 `showNullSetting` 恢复为原条件）
- Modify: `mail-vue/src/i18n/zh.js`、`en.js`（两条文案）

**Interfaces:**
- Consumes: Task 1 的接口。
- Produces: `forwardList()`、`forwardAdd(targetEmail)`；组件 `forward-panel` 无 props、无 expose。

- [ ] **Step 1: 请求封装与组件改写**

面板保留原对话框的全部行为（状态行、验证码输入、重发、启停、删除、3 条上限禁用输入、复制提示），去掉标题里的邮箱地址，`onMounted` 时 `load()`。

- [ ] **Step 2: 个人设置页与侧栏**

- [ ] **Step 3: 构建并验证**

Run: `cd mail-vue && pnpm build`
Expected: 成功。浏览器：个人设置页出现"邮件转发"区块；总开关关或无权限时不出现；侧栏邮箱下拉只有原来的重命名 / 置顶 / 删除；添加、验证、启停、删除流程与之前一致；英文界面文案正确。

- [ ] **Step 4: Commit**

```bash
git add mail-vue/src
git commit -m "feat(forward): move forwarding settings to the personal settings page"
```

---

### Task 3: 核对、文档与 PR 更新（控制者执行）

- [ ] 全部单测、前端构建通过；浏览器走一遍个人设置页流程和两个邮箱的转发。
- [ ] 推送到 `feat/account-forward`；更新 `disaster1-tesk/cloud-mail#1` 和 `maillab/cloud-mail#645` 的描述（入口、表名、按用户的行为），回复两个 PR 说明改动。

# 邮箱账号自动转发 设计文档

日期：2026-11-10
状态：评审完毕，待用户批准

## 1. 背景与目的

Cloud Mail 现在有三种"转发"：

1. 管理员在系统设置里配置的全局转发：所有收到的邮件（或按收件地址筛选）通过 Cloudflare 的 `message.forward()` 转到一组外部地址。全站一份配置，普通用户用不上，目标地址必须先在 Cloudflare 后台验证。
2. 站内互发的邮件通过 `forward` send_email 绑定转到同一组外部地址（`forward-mime.js`）。
3. 写信窗口里的手动"转发"按钮。

缺的是普通用户给自己的某个邮箱填一个外部地址，之后这个邮箱收到的信自动送过去，类似 Gmail 的"将邮件副本转发给"。这份文档描述这个功能。

用户的描述是："用户自动填入邮箱去转发"，配置粒度按邮箱账号（侧栏里的每一个地址各自配置）。

## 2. 目标 / 非目标 / 反目标

**目标**

- 用户在侧栏某个邮箱账号上填一个或多个外部邮箱地址，验证通过后，这个账号收到的邮件自动转到这些地址。
- 站外来信和站内互发的信都转。
- 管理员能整体开关这个功能，并按角色控制谁能用。
- 转发失败不影响正常收信。

**非目标（本期不做）**

- 按发件人、主题、关键字过滤的转发规则。
- 用户级的 Telegram / Webhook 推送。
- 管理员在用户管理页查看或代为管理用户的转发配置。
- 转发后在本站不保留副本（本站始终保留）。
- 改动现有的管理员全局转发。

**反目标（做了就算失败）**

- 被人当作垃圾邮件中继：填一个别人的邮箱就能让对方收到大量转发。
- 转发形成死循环，把发信额度打空。
- 转发出错导致收件流程抛异常，邮件丢失或被退回。

## 3. 约束

- **发信通道**：Cloudflare 的 `message.forward()` 和 send_email 绑定只能发到 Cloudflare 后台验证过的地址，用户自助填写做不到。所以用户级转发必须走项目已接入的真正发信渠道：Cloudflare Email Service（`env.email` 绑定）或 Resend（按域名配置 token）。没配任何发信渠道的站点无法使用本功能；某个域名没有 Resend token 且没有 `env.email` 时，这个域名下的邮箱也无法开启。
- **额度**：转发消耗 Cloudflare Email Service 或 Resend 的发信额度，是站长的成本。
- **运行环境**：Cloudflare Workers，D1（SQLite），Hono，Drizzle。收件入口是 `mail-worker/src/email/email.js` 的 `email` 事件处理函数，站内信在 `email-service.js` 的 `HandleOnSiteEmail` / `forwardOnSiteEmail`。
- **数据库迁移方式**：项目用 `init/init.js` 里按版本的 `vX_YDB` 函数做 `ALTER TABLE`，由 `/init/:secret` 触发，字段已存在时捕获异常跳过。新表、新字段、新权限点都走这条路。
- **权限机制**：权限点存在 `perm` 表，`security.js` 里 `requirePerms` 和 `premKey` 两张表把路径映射到权限 key；前端用 `v-perm` 指令和 `hasPerm()`。管理员（`env.admin`）绕过所有权限检查。
- **设置约定**：`setting` 表的开关字段用 `0 = 开，1 = 关`（见 `settingConst`）。
- **测试**：仓库里 `vitest.config.js` 指向不存在的 `wrangler.jsonc`，`test/index.spec.js` 是脚手架示例，没有可用的自动化测试。验证主要靠 `wrangler dev` 手工走流程。

## 4. 方案比较

| 方案 | 做法 | 取舍 | 结论 |
|---|---|---|---|
| A. 按邮箱账号配置，走发信渠道重发 | 每个账号一份目标地址列表；收到信后用账号自己的地址作为发件人，通过 Cloudflare Email Service / Resend 把正文和附件重新发出去 | 多一张表、一组接口和一个对话框；能支持"不同邮箱转到不同地方" | **采用**（用户选择） |
| B. 按用户配置，走发信渠道重发 | 用户只有一组目标地址，名下所有邮箱都转 | 最省事，但无法区分邮箱，后续加粒度要改表 | 放弃 |
| C. 复用 Cloudflare `message.forward()` | 直接把原始邮件转出去，保留原始信头和 DKIM | 目标必须在 Cloudflare 后台验证，用户自助做不到 | 放弃 |

## 5. 用户看到的行为

### 5.1 入口

侧栏每个邮箱账号右侧的齿轮下拉菜单里，在"重命名"下面加一项"转发设置"。显示条件：管理员总开关为开，且当前用户有 `account:forward` 权限。

```
┌──────────────────────────┐
│ alice@example.com        │
│  ✉                 📋 ⚙  │
│                     ├ 重命名
│                     ├ 转发设置   ← 新增
│                     ├ 置顶
│                     └ 删除
└──────────────────────────┘
```

### 5.2 转发设置对话框

```
┌──────────────── 转发设置 ─ alice@example.com ───────────────┐
│ 收到的邮件会自动转发到以下已验证的邮箱                        │
│                                                              │
│  me@gmail.com          已验证   [启用 ●]            [删除]    │
│  work@qq.com           待验证   [输入验证码] [重发]  [删除]    │
│  old@outlook.com       已停用   连续失败 10 次  [重新启用] [删除] │
│                                                              │
│  ┌──────────────────────────────┐                            │
│  │ 输入要转发到的邮箱地址        │  [添加]                     │
│  └──────────────────────────────┘                            │
│  最多添加 3 个，站内域名的地址不能作为转发目标                   │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 添加与验证流程

1. 用户输入地址点"添加"。后端校验（见 7.2），通过后生成 6 位数字验证码，发一封验证邮件到目标地址，列表里出现一条"待验证"记录。
2. 验证邮件：发件人是用户的这个邮箱账号，主题"验证转发邮箱"，正文说明"某某邮箱申请把邮件转发到这个地址，验证码 123456，30 分钟内有效。如果不是你操作的请忽略"。
3. 用户在对话框里点"输入验证码"，填 6 位数字提交。正确则状态变为"已验证"并自动启用。
4. 验证码过期或忘了，点"重发"重新生成并发送；两次重发间隔至少 60 秒。
5. 连续输错 5 次，这条记录的验证码作废，必须重发。

### 5.4 转发的邮件长什么样

- **发件人（From）**：用户的这个邮箱账号，显示名用原发件人的名字，例如 `"GitHub" <alice@example.com>`。这样用户在外部邮箱里一眼能看到是谁发的，又不会因为伪造发件域名被对方拒收。
- **回复地址（Reply-To）**：原发件人地址。用户在外部邮箱直接回复，回到原发件人。
- **主题**：和原邮件一致，不加 Fwd 前缀。
- **正文**：原邮件的 HTML 和纯文本，用解析出来的原始 HTML（内嵌图片仍是 `cid:` 引用），不用库里存的版本。库里的正文把内嵌图片改成了 `{{domain}}` 占位符，而 `settingService.refresh` 把 `r2Domain` 强制清空，占位符在站内只会被替换成相对路径，转到外部邮箱会裂图。
- **附件**：原样带上，包括内嵌图片附件（带 `contentId`，`disposition: inline`）。
- **自定义信头**：`X-CloudMail-Forwarded: 1` 和 `X-CloudMail-Forwarded-For: <账号地址>`，用于防循环。

### 5.5 什么时候不转

- 账号被软删除、用户被封禁、账号没有已验证且启用的目标地址。
- 邮件状态不是正常收件（无人收件 `NOONE`、拒收 `BOUNCED` 的不转）。
- 来信带有 `X-CloudMail-Forwarded` 信头（说明是别的 Cloud Mail 站或本站转出来的，不再转）。
- 用户的角色被禁止发信（`sendType = ban`）或只能站内发信（`sendType = internal`）。
- 管理员总开关关闭，或该用户的角色没有 `account:forward` 权限（权限在转发执行时也检查，不只在界面上藏入口）。
- 账号所在域名没有可用发信渠道。

### 5.6 失败处理

- 单次转发失败只记日志、把这条目标记录的 `fail_count` 加一、写入 `last_error`，不影响收件。
- 成功一次把 `fail_count` 清零。
- `fail_count` 达到 10，状态改为"已停用（自动）"，界面显示原因。用户点"重新启用"后清零计数并恢复。

## 6. 数据模型

> 注意：本节中与邮箱账号相关的内容已被第 12 节（改为按用户）覆盖。

### 6.1 新表 `account_forward`

| 字段 | 类型 | 说明 |
|---|---|---|
| forward_id | INTEGER PK AUTOINCREMENT | |
| account_id | INTEGER NOT NULL | 所属邮箱账号 |
| user_id | INTEGER NOT NULL | 所属用户，冗余便于按用户清理和校验 |
| target_email | TEXT NOT NULL | 目标地址，存小写 |
| status | INTEGER NOT NULL DEFAULT 0 | 0 待验证，1 已启用，2 已停用（用户手动），3 已停用（连续失败） |
| verify_code | TEXT NOT NULL DEFAULT '' | 当前验证码，验证通过后清空 |
| verify_expire_time | TEXT | 验证码过期时间（UTC） |
| verify_send_time | TEXT | 上次发验证邮件的时间，用于 60 秒限频 |
| verify_fail_count | INTEGER NOT NULL DEFAULT 0 | 验证码输错次数 |
| fail_count | INTEGER NOT NULL DEFAULT 0 | 连续转发失败次数 |
| last_error | TEXT NOT NULL DEFAULT '' | 最近一次转发失败原因 |
| create_time | TEXT DEFAULT CURRENT_TIMESTAMP | |

索引：

- `idx_account_forward_account ON account_forward(account_id, status)`：收件时按账号查启用的目标。
- `UNIQUE idx_account_forward_unique ON account_forward(account_id, target_email COLLATE NOCASE)`：同一账号不重复添加。

Drizzle 实体：`mail-worker/src/entity/account-forward.js`，常量加到 `entity-const.js` 的 `accountForwardConst`。

### 6.2 `setting` 表新增字段

- `user_forward INTEGER NOT NULL DEFAULT 1`：用户转发总开关，`0 开 1 关`，默认关。管理员在系统设置里打开。

`settingService.websiteConfig` 把 `userForward` 暴露给前端，前端据此决定是否显示入口。

### 6.3 新权限点

在 `perm` 表插入：

```sql
INSERT INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES
(37, '邮箱转发', 'account:forward', 21, 2, 3)
```

挂在"邮箱侧栏"（perm_id 21）下。`mail-worker/src/i18n/zh.js` 和 `en.js` 的 `perms` 里加对应翻译。已有角色不会自动获得这个权限，需要管理员在权限页勾选。

### 6.4 迁移

`init/init.js` 新增 `v3_5DB`，在 `init()` 的调用链末尾加入，内容：建表、建索引、`ALTER TABLE setting ADD COLUMN user_forward`、插入权限点。每一步都用现有的 try/catch 跳过已存在的写法。

### 6.5 级联清理

- `accountService.physicsDelete`（删单个账号）和 `physicsDeleteByUserIds`（删用户）里删除对应的 `account_forward` 行。
- 账号软删除（`isDel = 1`）不删转发记录，但 5.5 的规则会让它们不生效；账号恢复后自动恢复生效。

## 7. 后端

### 7.1 新文件

- `mail-worker/src/service/forward-service.js`：转发配置的增删改查、验证、以及收件时的转发执行。
- `mail-worker/src/api/forward-api.js`：路由，注册到 `hono/webs.js`。
- `mail-worker/src/entity/account-forward.js`：实体。

### 7.2 接口

所有接口都要求登录，并在 `security.js` 的 `requirePerms` 里加 `/forward/`，`premKey` 里加 `'account:forward': ['/forward/list', '/forward/add', '/forward/verify', '/forward/resendCode', '/forward/setStatus', '/forward/delete']`。每个接口都校验目标账号属于当前登录用户，否则按现有写法抛 `BizError`。

| 方法 路径 | 入参 | 行为 |
|---|---|---|
| GET `/forward/list` | accountId | 返回该账号的转发记录列表（不返回 verify_code） |
| POST `/forward/add` | accountId, targetEmail | 校验后插入待验证记录并发送验证邮件；返回新记录 |
| POST `/forward/verify` | forwardId, code | 校验验证码；通过则 status=1、清空验证码 |
| POST `/forward/resendCode` | forwardId | 60 秒限频，重新生成验证码并发送 |
| PUT `/forward/setStatus` | forwardId, status (1 或 2) | 已验证的记录在启用/停用间切换；从状态 3 切到 1 时清零 fail_count 和 last_error |
| DELETE `/forward/delete` | forwardId | 删除记录 |

`/forward/add` 的校验顺序：

1. 总开关 `userForward` 为开。管理员也受这个开关约束（它是功能开关，不是权限；管理员绕过的只有角色权限检查）。
2. `targetEmail` 格式合法（`verifyUtils.isEmail`），转小写。
3. 目标域名不在 `settingService.query(c).domainList` 里（禁止站内地址）。
4. 目标地址不等于该账号自己的地址。
5. 该账号属于当前用户且未删除。
6. 该账号已有记录数（任意状态）小于 3。
7. 同一账号没有相同地址（不区分大小写）。
8. 该账号所在域名有可用发信渠道：`env.email` 存在，或 `resendTokens[domain]` 存在。否则报"该域名未配置发信渠道，无法开启转发"。
9. 当前用户的角色 `sendType` 不是 `ban` 或 `internal`（管理员除外）。转发本质是对外发信，被禁止发信或只能站内发信的角色不能用。`availDomain` 不用再查，账号创建时已经校验过。
10. 验证邮件限频（见下）。

验证码：6 位数字，`crypto.getRandomValues` 生成，30 分钟过期，明文存库（它只保护一个"是否允许转发到我"的决定，泄露风险低，不值得引入哈希和盐）。

验证邮件限频，`/forward/add` 和 `/forward/resendCode` 共用，防止拿验证邮件骚扰别人。存在 D1 表 `forward_verify_quota`（`quota_key` 主键、`count`、`last_time` 毫秒时间戳）里，每项用一条带条件的 `INSERT ... ON CONFLICT DO UPDATE ... WHERE ... RETURNING` 同时完成判断和占用，并发请求只有一个能通过。KV 读写不是原子的，并发重发会全部绕过限频，所以不用 KV。发送前占用，发送失败不退还。

- 按目标地址：key `target:<小写地址>`，距上次占用不足 60 秒则拒绝，提示"请稍后再试"。这同时覆盖了"删掉再加同一地址"的绕过。
- 按用户：key `day:<userId>:<YYYY-MM-DD>`，每天最多 10 封验证邮件。超出提示"今日验证邮件次数已达上限"。
- 每小时的定时任务删除两天前的记录。

原先"单条记录 60 秒"的规则由按目标地址的限频取代，`verify_send_time` 字段仅用于界面显示上次发送时间，可以保留也可以去掉。

### 7.3 验证邮件的发送

复用 `emailService` 里已有的渠道函数 `sendByCloudflareEmail` 和 `sendByResend`，渠道选择和 `send()` 一致：有 `env.email` 优先，否则用账号域名的 Resend token。发件人是用户的账号地址，显示名用账号的 `name`。模板放在 `mail-worker/src/template/forward-verify.js`，中英双语各一份，按请求的语言选择（项目已有 `i18n`）。

验证邮件不计入用户的发信次数，不写入 `email` 表（它不是用户写的信）。

### 7.4 收件时的转发执行

`forwardService.forwardReceived(c, emailRow, message)`，`message` 是原始邮件内容 `{ subject, html, text, fromAddress, fromName, attachments, rawHeaders }`。两个调用点：

1. `email/email.js`：在 `completeReceive` 之后、管理员"转发规则"（`ruleType === RULE` 时的提前 `return`）**之前**调用。此时 `emailRow` 已带上最终状态和 `accountId`。`attachments` 用这一轮解析出来的附件数组（`postal-mime` 的结果，含 `content` 二进制）。额外传 `rawHeaders: email.headers`，用于检查 `X-CloudMail-Forwarded`。
2. `email-service.js` 的 `forwardOnSiteEmail`：在按 `ruleEmail` 过滤之前，对 `emailRowList` 里每条有 `accountId` 的收件记录调用。附件用 `sendParams.attachments`（站内发送时已是二进制或 base64 形式，`toCloudflareAttachments` / `toResendAttachments` 都能处理）。站内信没有原始信头，`rawHeaders` 传空。

管理员的"转发规则"（全部转发 / 规则转发）只约束管理员自己的推送渠道（Telegram、Webhook、全局转发邮箱），不约束用户自助转发。用户的转发是用户对自己邮箱的设置，和站长的推送筛选是两回事。

`forwardReceived` 内部逻辑：

1. `emailRow.accountId === 0` 或状态不是 `RECEIVE` → 返回。
2. `rawHeaders` 里有 `x-cloudmail-forwarded` → 返回。
3. 读设置，总开关关 → 返回。
4. 查 `account_forward` 里 `account_id = emailRow.accountId AND status = 1` 的记录，没有 → 返回。
5. 查账号和用户：账号 `isDel` 或用户 `status = BAN` → 返回。查用户角色：非管理员且（角色没有 `account:forward` 权限，或角色 `sendType` 是 `ban` / `internal`）→ 返回。（这一步每封信一次查询，可接受；项目在收件路径里已经做了类似的角色查询。）
   系统设置里的"发件功能"开关（`setting.send`）不影响转发，转发有自己的总开关。
6. 确定渠道：`env.email` 或该域名的 Resend token。都没有 → 把所有目标的 `last_error` 记为"no send provider"，返回。
7. 构造发送参数：
   - `accountEmail`: 账号地址；`name`: `emailRow.name`（原发件人名字）
   - `receiveEmail`: `[target_email]`
   - `subject`: `emailRow.subject`
   - `html`: 原始 HTML。站外来信用 `postal-mime` 解析出的 `email.html`；站内信用 `sendParams.html`（已是 `cid:` 引用）
   - `text`: 原始纯文本，同上
   - `attachments`: 全部附件原样传入，内嵌图片带 `contentId` 以 inline 方式发送
   - `replyTo`: `emailRow.sendEmail`
   - `headers`: `X-CloudMail-Forwarded: 1`, `X-CloudMail-Forwarded-For: <账号地址>`
8. 对每个目标地址逐一发送（`Promise.all`，与现有全局转发写法一致），每个各自 try/catch。成功清零 `fail_count`；失败 `fail_count + 1`、写 `last_error`，达到 10 时 `status = 3`。
9. 整个函数外层 try/catch，任何异常只 `console.error`，不向上抛。

`sendByCloudflareEmail` 和 `sendByResend` 目前只支持 `in-reply-to` / `references` 两个信头。需要扩展为接受通用的 `replyTo` 和 `headers` 参数：Resend 的 SDK 用 `replyTo` 和 `headers` 字段；Cloudflare Email Service 的 `send()` 请按其当前文档确认 `replyTo` 字段名，不支持时退回到 `headers['Reply-To']`。这个扩展不改变现有调用方的行为。

### 7.5 系统设置

`settingService.set` 已是通用的字段更新，不需改。前端系统设置页"邮件推送"卡片里加一行"用户自助转发"，开关直接调 `/setting/set` 更新 `userForward`。

## 8. 前端

> 注意：本节中与邮箱账号相关的内容已被第 12 节（改为按用户）覆盖。

- `mail-vue/src/request/forward.js`：六个接口的封装。
- `mail-vue/src/layout/account/index.vue`：下拉菜单加"转发设置"项，点击打开对话框并传入账号。
- `mail-vue/src/components/forward-dialog/index.vue`：5.2 的对话框，包含列表、添加输入框、验证码输入（可以用一个小的内嵌 `el-dialog` 或行内展开，交给实现者）。沿用项目里 `ElMessage` 提示、`t()` 文案、`plain: true` 的风格。
- `mail-vue/src/views/sys-setting/index.vue`：加"用户自助转发"开关。
- `mail-vue/src/i18n/zh.js`、`en.js`：新增文案，包括权限名 `邮箱转发` / `Mailbox forwarding`。
- `settingStore.settings` 里有 `userForward` 后，入口显示条件：`settingStore.settings.userForward === 0 && hasPerm('account:forward')`。

## 9. 留给实现者决定的

- 验证码输入的具体交互（内嵌对话框还是行内展开）。
- 对话框和列表的样式细节，沿用 `sys-setting` 里 `forward-dialog` 一类的既有样式即可。
- 验证邮件模板的具体排版。
- `forwardReceived` 在 `email.js` 里是 `await` 还是 `ctx.waitUntil`。现有的 Telegram / Webhook 推送是 `await`，保持一致即可；如果担心超时再改。
- 附件总大小超出渠道上限时怎么办（直接让渠道报错并计入失败即可，不必预判）。
- 是否把转发结果写一条日志到 `email.message` 字段。不要求。

## 10. 验证方式

> 注意：本节中与邮箱账号相关的内容已被第 12 节（改为按用户）覆盖。

没有可用的自动化测试，用 `wrangler dev --config wrangler-dev.toml` 配合一个有 Resend token 的测试域名手工验证：

1. 迁移：访问 `/api/init/<secret>`，确认表、字段、权限点存在，重复访问不报错。
2. 权限：无权限角色看不到入口，直接调接口返回 403；总开关关闭时任何人（含管理员）调添加接口都返回业务错误，且已配置的转发不执行。
2a. 角色限制：`sendType` 为 `ban` 或 `internal` 的角色不能添加，已有配置不执行。
3. 添加：站内地址、重复地址、第 4 个地址、无发信渠道的域名都被拒绝；合法地址收到验证邮件。
4. 验证：错码 5 次后作废；同一目标地址 60 秒内再次添加或重发被拒；同一用户一天第 11 封验证邮件被拒；正确码后状态为启用。
5. 转发：给该账号发一封带附件和内嵌图片的信，目标邮箱收到，发件人显示名是原发件人，回复落到原发件人，附件和图片完整。
6. 防循环：把目标邮箱设为另一个 Cloud Mail 站的地址并反向配置，确认只转一跳。
7. 失败：把 Resend token 改坏，发 10 封，确认状态变为自动停用，界面显示原因，重新启用后恢复。
8. 清理：删除账号后 `account_forward` 行消失。

## 11. 评审结论

评审代理提出四个问题，处理如下：

- 总开关对管理员同样生效（设计者定，见 7.2 第 1 条）。
- 用户转发不受管理员"转发规则"过滤（设计者定，见 7.4）。
- 禁止发信和只能站内发信的角色不能转发（设计者定，见 7.2 第 9 条、7.4 第 5 步）。
- 验证邮件按目标地址和按用户双重限频（设计者定，见 7.2）。
- **转发本身不设上限**（用户决定，2026-11-11）。转发不计入用户发信次数，也没有每日上限；站长通过总开关、角色权限和角色发信类型控制范围。额度消耗是站长可接受的成本。

## 12. 变更：改为按用户配置（2026-11-11，用户决定）

用户在看到按邮箱账号的实现后改变决定："只要配置了邮箱转发，用户收到的所有邮箱都转发过去"。本节覆盖前文与之冲突的内容；未提到的部分（验证码、限频、管理员总开关、角色权限、转发邮件样式、防循环、失败处理）不变。

### 12.1 行为

- 转发目标挂在**用户**下，不再挂在邮箱账号下。一个用户最多 3 个目标地址（任意状态都计数）。
- 用户名下任意邮箱（含以后新增的）收到的邮件，都转发到该用户已验证且启用的目标。
- 入口从侧栏邮箱下拉菜单移到**个人设置**页，作为一个"邮件转发"区块（内联面板，不是对话框），显示条件不变：总开关开且有 `account:forward` 权限。
- 验证邮件的发件人是用户的主邮箱（`user.email`），显示名用主邮箱账号的名字。
- 转发出去的邮件发件人仍是**收到这封信的那个邮箱**（5.4 不变），发信渠道按该邮箱的域名选择。

### 12.2 数据

表改名为 `user_forward`（`account_forward` 从未发布，直接替换 `v3_5DB` 里的建表语句）：去掉 `account_id`，其余列同 6.1。索引 `idx_user_forward_user ON user_forward(user_id, status)`，唯一索引 `(user_id, target_email COLLATE NOCASE)`。Drizzle 实体 `entity/user-forward.js`，导出 `userForward`。删除用户时级联删除；删除单个邮箱不再涉及转发记录。

### 12.3 接口

路径和权限映射不变，入参去掉 `accountId`：`GET /forward/list`（无参数，返回当前用户的记录）、`POST /forward/add {targetEmail}`、其余四个不变。校验顺序同 7.2，其中"该账号属于当前用户"改为"当前用户存在且未删除"，`existingTargets` 取该用户全部记录，`accountEmail` 用 `user.email`。

### 12.4 收件时

`forwardReceived` 按 `emailRow.userId` 查启用记录；仍要求收信邮箱存在且未删除、用户未删除未封禁、角色检查通过。其余步骤不变。

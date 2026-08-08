# Cloud Mail 后端深度安全审计与加固报告

> 审计日期：2026-08-06
> 审计对象：`mail-worker` Cloudflare Worker 后端，并检查与 OAuth 登录相关的 `mail-vue` 前端调用
> 审计方式：路由与权限映射、对象归属、输入边界、SQL、D1/KV/R2/S3、邮件收发、OAuth、Webhook、Turnstile、APNs、定时任务和配置静态审计，并对可独立运行的密码/JWT/Webhook 组件执行测试。

## 1. 结论

本次审计发现并修复了多项可导致认证绕过、账号绑定劫持、SQL 注入、密码哈希泄露、Webhook 伪造、邮件隐私泄露和对象存储主动内容执行的风险。修复采用以下原则：

- 默认拒绝：公开路由、跨域、初始化、Webhook 和 OAuth 均改为显式允许。
- 向后兼容：旧 SHA-256 密码仍可登录，成功登录后自动升级为 PBKDF2。
- 对象归属优先：所有用户可操作的邮箱、邮件、附件、收藏和账户均检查所属用户。
- 安全配置不入库：JWT、初始化、OAuth、Webhook 和 APNs 私钥通过 Worker Secret 提供。
- 失败可恢复：注册邀请码、用户创建、附件保存和 OAuth 绑定增加原子更新或补偿清理。

修复后仍需部署方正确设置 Secret、执行数据库迁移并轮换历史密钥。未执行迁移时，设备令牌全局唯一约束等新逻辑不能完整生效。

## 2. 已修复的高危问题

| 编号 | 问题 | 影响 | 修复 |
|---|---|---|---|
| H-01 | 公开路由使用 `startsWith` 前缀白名单 | 可构造相同前缀路径绕过鉴权 | 改为“HTTP 方法 + 精确路径/受控正则”匹配 |
| H-02 | OAuth 绑定只依赖可预测的 `oauthUserId` | 攻击者可将他人 OAuth 身份绑定到自己的邮箱 | 增加一次性 state、短期绑定 JWT、KV nonce 和单次消费 |
| H-03 | 管理员批量导入拼接 SQL | 可触发 SQL 注入或破坏数据 | 全部改为参数化 SQL，并限制单批数量、域名、角色和密码 |
| H-04 | 用户列表返回完整 `user` 表 | 密码哈希和 salt 暴露给前端 | 改为显式响应字段白名单，永不返回密码和 salt |
| H-05 | 密码使用单轮 SHA-256 | 数据库泄露后易被离线破解 | 新密码使用 PBKDF2-SHA256 210,000 次；旧密码登录后自动升级 |
| H-06 | JWT 未强制过期和算法约束 | 长期有效或算法混淆风险 | 强制 HS256、`typ=JWT`、规范 Base64URL、`exp/nbf/iat` 校验和最短 32 字符密钥 |
| H-07 | 注销流程缺少正确等待/令牌移除 | 可能删除错误会话或注销失效 | 只删除当前 session token，并正确等待 KV 操作 |
| H-08 | Resend Webhook 可无签名调用 | 可伪造发送状态、退信或投诉 | 默认强制 Svix HMAC 签名、时间窗、事件 ID 防重放和状态防回退 |
| H-09 | 站内投递复制 BCC | 密送地址可能泄露给收件人 | 收件人副本统一清空 BCC，仅发件人副本保留 |
| H-10 | 邮件 HTML/对象文件可承载主动内容 | 存储型 XSS、SVG/HTML 脚本执行 | 邮件 HTML 清洗；查看页移除脚本并启用 CSP；HTML/SVG/XML/JS 对象强制下载 |

## 3. 已修复的中危问题

### 3.1 鉴权、权限与会话

- 权限表改为方法级路由匹配，避免同一路径不同 HTTP 方法共用错误权限。
- 账户重命名、全部接收、置顶等接口纳入 `account:query` 权限并校验所有权。
- `role/selectUse` 纳入 `role:query`，避免普通用户枚举管理角色。
- 管理员账户禁止被删除、封禁、改角色或重置发送额度。
- 修改密码、封禁、改角色、删除用户时主动撤销现有会话。
- KV 会话只保存必要用户字段，不再缓存密码和 salt。
- 单用户最多保留 10 个登录 session token。

### 3.2 注册、邀请码与 Turnstile

- 注册和新增账户均重新验证站点开关、域名、前缀长度、黑名单和角色域名权限。
- 邀请码扣减使用 `count > 0` 的条件原子更新；后续创建失败时恢复次数。
- Turnstile 强制检查 secret、请求超时和响应成功状态。
- 可通过 `turnstile_hostnames` 和 `turnstile_action` 校验 hostname/action。
- 注册/新增计数使用 D1 UPSERT，避免并发读后写导致计数丢失。
- 登录、注册、OAuth、公开令牌和初始化增加速率限制。

### 3.3 SQL、D1 与数据一致性

- 分析时区不再拼接到 SQL，改为校验 IANA 时区并绑定 UTC offset 参数。
- 新增收藏、验证码记录、OAuth 用户、设备令牌、角色权限和默认角色唯一约束。
- 迁移会先清理重复记录和部分孤儿记录，再创建索引。
- 角色删除时用户迁移、权限删除和角色删除放入同一 D1 batch。
- 默认角色切换放入同一 D1 batch，并增加单默认角色部分唯一索引。
- 关键邮件、账户、附件、邀请码查询增加组合索引。

### 3.4 邮件、附件与隐私

- 软删除、封禁或角色无效的用户不再接收入站邮件。
- 入站邮件限制原始大小、正文长度、地址数量、附件数量、单附件和总附件大小。
- 附件写入失败时回滚邮件记录和本次新写对象。
- 回复邮件只能引用当前用户拥有的原邮件。
- 站内邮箱匹配改为大小写不敏感。
- 邮件列表、详情、附件、收藏、已读、删除均校验用户归属。
- 附件文件名和 Content-Disposition 清理 CR/LF、路径字符和控制字符。
- 危险 MIME 类型不再内联执行。
- 无效/删除账户的 `SAVING` 邮件不会被定时任务误标为正常收件。

### 3.5 OAuth、Webhook 与第三方调用

- OAuth state 默认强制启用并单次消费。
- OAuth provider 请求增加 15 秒超时、返回字段长度限制、账户 active/silenced/trust level 检查。
- OAuth 未绑定用户获得 10 分钟短期绑定凭证，不再向客户端信任原始 OAuth ID。
- Resend Webhook 增加 5 分钟签名时间窗、24 小时事件去重和状态防回退。
- Telegram 邮件查看 token 增加用途声明和 7 天上限。
- Telegram HTML 查看页增加严格 CSP、禁止引用来源和缓存限制。
- 外部 fetch 均对关键路径增加超时或受控错误处理。

### 3.6 对象存储、S3 与 APNs

- 对象读取仅允许 `attachments/` 和 `static/background/`，拒绝路径穿越和异常编码。
- R2、KV、S3 返回统一经过安全响应层。
- S3 Endpoint、自定义域名和对象域名只允许 HTTP(S)，拒绝凭据和本地/私有网络地址。
- S3 删除不再依赖 Workers WebCrypto 不保证支持的 MD5，改为受控并发单对象删除。
- APNs device token 严格校验、单用户最多 10 个、同一 token 只能属于一个用户。
- APNs 只在明确的无效 token 错误时删除设备记录，避免临时失败导致永久退订。

### 3.7 配置、初始化与错误处理

- 新初始化入口：`POST /api/init` + `X-Init-Secret`。
- 旧 `GET /api/init/:secret` 默认关闭，避免 secret 出现在 URL、日志和历史记录中。
- `init_secret` 与 `jwt_secret` 分离，均要求至少 32 字符。
- 开发/测试配置移除可复用 JWT secret 和真实资源 ID，增加 `.dev.vars.example`。
- GitHub/Action Wrangler 模板不再把 JWT、OAuth client secret 等写入 `[vars]`。
- CORS 默认仅同源；额外来源必须通过 `cors_origins` 明确配置。
- 增加请求 ID、安全响应头、40 MB API 请求体上限和 JSON 语法错误处理。
- 未预期异常不再把内部错误详情返回客户端。
- 定时任务使用 `Promise.allSettled` 隔离失败，单项失败不再阻断其他维护任务。

## 4. 必须执行的部署步骤

### 4.1 备份

部署前导出 D1 数据库，并确认 KV/R2/S3 中的重要邮件附件有备份。数据库迁移包含去重和孤儿数据清理。

### 4.2 配置并轮换 Secret

至少设置以下 Secret，且每个值独立随机生成：

```bash
cd mail-worker
wrangler secret put jwt_secret
wrangler secret put init_secret
wrangler secret put resend_webhook_secret
wrangler secret put linuxdo_client_secret       # 使用 Linux DO OAuth 时
wrangler secret put apns_private_key             # 使用 APNs 时
```

建议同时把 APNs Key ID、Team ID、Bundle ID 作为 Secret 或受保护变量保存。`jwt_secret` 和 `init_secret` 至少 32 个字符，不得复用。

**历史配置中出现过的 JWT secret、OAuth secret、Webhook secret 均应立即轮换。** 已签发 JWT 会在 JWT secret 轮换后失效，用户需要重新登录。

### 4.3 配置安全变量

```toml
[vars]
domain = ["mail.example.com"]
admin = "admin@mail.example.com"
cors_origins = "https://mail.example.com"
oauth_state_required = true
allow_legacy_init = false
allow_unsigned_resend_webhook = false
turnstile_hostnames = "mail.example.com"
# turnstile_action = "register" # 仅当前端生成 token 时固定 action
```

不要在 `[vars]`、Git 仓库、构建日志或前端环境变量中保存 Secret。

### 4.4 部署后立即执行数据库迁移

```bash
curl -X POST "https://mail.example.com/api/init" \
  -H "X-Init-Secret: <你的 init_secret>"
```

成功响应应为 `success`。必须在开放用户访问前执行，尤其是启用了 iOS device token 注册时。

### 4.5 配置 Resend Webhook

在 Resend 控制台复制 Signing Secret，保存到 `resend_webhook_secret`。Webhook URL 为：

```text
https://mail.example.com/api/webhooks
```

不要为了临时排障长期设置 `allow_unsigned_resend_webhook=true`。

### 4.6 重新构建前端

OAuth state 流程同时修改了 Vue 登录页。部署 Worker 前需重新安装依赖并构建 `mail-vue`，确保新静态资源进入 `mail-worker/dist`。

## 5. 兼容性变化

- JWT secret 少于 32 字符时，登录和鉴权会明确失败；必须先配置强 secret。
- 旧 SHA-256 密码继续可用，登录成功后自动升级，无需强制用户重置。
- 旧初始化 URL 默认返回 404；使用新的 POST 初始化方式。
- 未配置 Resend Webhook secret 时，Webhook 默认返回 503，不再接受无签名事件。
- OAuth 默认要求 state；旧前端必须与本次 Vue 修改一同部署。
- `role/selectUse` 现在需要 `role:query` 权限。
- 设备令牌注册依赖新增的 `device_token(device_token)` 唯一索引，先迁移后开放 App。
- API 业务错误仍保留原项目的 JSON `code` 兼容模式；未预期异常使用真实 HTTP 500。

## 6. 保留风险与后续建议

以下风险受 Cloudflare 架构或兼容性限制，本次未完全消除：

1. **D1、KV 与对象存储不是同一事务。** 已对关键流程增加补偿清理，但 Worker 在极端中断时仍可能留下孤儿对象或临时记录。建议增加定期一致性扫描任务。
2. **KV 速率限制为最终一致。** 可降低自动化滥用，但不能替代 Durable Object 或 Cloudflare Rate Limiting 产品的强原子限流。
3. **外部邮件服务与本地数据库无法原子提交。** Provider 已接受邮件后，如果 D1/对象存储失败，可能出现“邮件已发出但本地发送记录不完整”。建议引入 outbox/idempotency 设计。
4. **发送额度存在并发竞争窗口。** 高并发发送时，多个请求可能同时通过额度检查。建议用 D1 条件更新或 Durable Object 串行化发送额度。
5. **附件 URL 仍是不可枚举路径的公开读取链接。** 为兼容邮件正文和现有客户端，本次没有改为短期签名 URL。高隐私场景建议增加签名、过期时间和授权代理。
6. **管理员可配置公告 HTML、转发目标和第三方凭据。** 管理员权限本身属于高信任边界，应开启强密码、限制管理入口来源并定期审计管理员会话。
7. **缺少真实 Cloudflare 集成环境。** 本地环境无法执行 D1/KV/R2/Email Routing/APNs/Resend 的端到端测试，部署前必须在 staging Worker 验证。

## 7. 验证清单

本次交付执行或包含以下验证：

- 全部 Worker/Vue JavaScript 文件 `node --check`。
- 修改过的 Vue `<script setup>` 语法抽取检查。
- `git diff --check` 空白与冲突检查。
- Wrangler TOML 和 package JSON 解析。
- PBKDF2：正确密码通过、错误密码失败、随机密码格式检查。
- JWT：规范 Base64URL、签名校验、用途隔离、篡改拒绝、过期拒绝。
- Svix：正确签名通过、篡改 payload 失败、超时签名失败。
- v3.2/v3.3 安全迁移：在包含重复 OAuth、设备 token、角色权限、收藏和验证码记录的 SQLite 数据上执行。
- 可重复执行脚本：`npm run security:test` 与 `npm run security:migration-test`。
- 配置扫描：确认提交文件不包含真实 JWT/OAuth/APNs/Webhook Secret 或真实 Cloudflare 资源 ID。
- 最终压缩包独立解压、再次解析和完整性检查。

## 8. 建议的上线验收场景

1. 普通用户不能访问用户、角色、全站邮件和系统设置接口。
2. 构造 `/loginAnything`、`/oauthAnything` 等路径不能绕过鉴权。
3. OAuth callback 缺失/错误/重复 state 均失败；绑定 token 重复使用失败。
4. 管理员用户列表响应不包含 `password`、`salt`。
5. 未签名或重放的 Resend Webhook 被拒绝/忽略。
6. 注册关闭后旧注册页面提交也失败；Turnstile hostname 不匹配失败。
7. 删除或封禁用户后不能登录、不能收信，已有 token 失效。
8. 用户不能读取、收藏、删除或回复其他用户的邮件/附件。
9. BCC 仅在发件人副本出现，收件人副本不含 BCC。
10. HTML/SVG 附件以下载方式返回，邮件查看页无法执行 script。
11. 同一 APNs token 在另一个账号注册后只属于最新账号。
12. 定时任务中某一项失败时，其他任务仍继续执行。

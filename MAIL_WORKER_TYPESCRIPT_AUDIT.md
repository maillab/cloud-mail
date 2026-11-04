# mail-worker TypeScript Migration & Refactoring Audit

审计日期：2026-10-03（Asia/Taipei）。源码基线：`b4b0b421a07673dc96b8da935211f895dfb35fcb`。仓库：`D:/MailServer/cloud-mail`。

本阶段重新阅读根 AGENTS.md、mail-worker/src 全部 82 个 JS 文件、package/lockfile、四份 Wrangler 配置、数据库升级链、测试/部署脚本，并对照 React API、类型、OAuth 和写信/附件消费者。没有修改业务源码、配置或 lockfile，没有部署、访问线上 D1/KV/R2 或触发远程初始化。新增的持久交付只有本报告；本地构建、类型探查及实验产物位于被忽略的 dist/.wrangler 中。

## 1. 审计结论与证据边界

现有后端的骨架适合保留：一个 Worker 承载 HTTP、入站邮件和定时事件，Hono API 实际已经承担 Controller 职责，Service 组织业务，Drizzle 访问 D1。没有必要为了 TypeScript 新增同功能 Controller、把每个查询包装成 DAO，或者全面改成 Java/Spring 式分层。

真正需要优先解决的是认证与资源不变量、不可逆邮件投递的副作用顺序、附件引用完整性、数据库历史升级，以及 HTTP 与非 HTTP 事件共用的隐式上下文。TypeScript 可以让这些边界明确，但不能自动修复并发、越权、SQL 拼接、邮件字节损坏或多存储一致性。

推荐先建立契约测试与数据基线，再以独立小改动修复高优先级缺陷，随后渐进迁移类型和拆分邮件工作流。纯类型迁移、行为修复、数据库变更分别评审和验证。

证据分三类：

- **源码确认**：完整追踪调用方、被调用方和实际分支；行号对应本次基线。
- **本地复现**：执行真实函数或 Wrangler bundle，使用内存 stub、真实已安装库、Node 内存 SQLite。能够确认局部逻辑，不能替代真实 Cloudflare 联调。
- **平台/并发风险**：由源码与官方平台语义推导，注明前提；没有把这些推导描述成线上已发生事件。

没有验证生产环境绑定、现存 D1 schema/数据、真实 OAuth 控制台、Resend 签名、Email Service 账户能力或线上投递成功率。默认配置打包成功不等于生产部署可用。

## 2. 当前实际架构

### 2.1 Worker 入口、Hono 初始化与路由

[src/index.js:9](D:/MailServer/cloud-mail/mail-worker/src/index.js:9) 的导出对象有 `fetch`、`email`、`scheduled` 三个 handler。

HTTP 分派顺序是：

```text
request
  ├─ /api/* → 去掉 /api → Hono app.fetch(request, env, ctx)
  │                        → CORS → 请求语言 → security → API → Service
  │                        → Drizzle/D1、KV、对象存储、外部服务
  │                        → result.ok / 全局 onError
  ├─ /static/*、/attachments/*、/mail/attachments/* → KV 对象响应
  │      旧 /mail/attachments/* 规范化为 attachments/* key
  └─ 其他路径 → env.assets.fetch → React 静态资源/SPA
```

[src/hono/hono.js:2](D:/MailServer/cloud-mail/mail-worker/src/hono/hono.js:2) 创建模块级 `new Hono()`，注册 CORS 和 onError。[src/hono/webs.js:1](D:/MailServer/cloud-mail/mail-worker/src/hono/webs.js:1) 导入这个单例，先导入 security，再通过副作用 import 注册各 api 文件。user-api 被重复 import，但 ESM 只执行一次；test-api 为空，不能算额外 API。AST 共识别 **65 个 method/path 路由**，完整清单在附录。

源码中的 i18n 被 security/service 的 import 图提前执行，向同一个 app 注册 middleware。对实际 Wrangler bundle 的本地检查确认顺序是 **CORS → i18n → security → 路由**，不是仅从 webs 的文字排列猜顺序。CORS 的 OPTIONS 可以提前返回，不进入后两者。

API 层大多只有读取 `c.req.query()/param()/json()`、取得当前 userId、调用 service 和包装响应。典型链：[src/api/email-api.js:7](D:/MailServer/cloud-mail/mail-worker/src/api/email-api.js:7) → `emailService.list(c, query, userId)` → `orm(c)`/email、account、star 联查 → 可选附件查询 → `{list,total,latestEmail}` → `result.ok`。[src/api/role-api.js:22](D:/MailServer/cloud-mail/mail-worker/src/api/role-api.js:22) 直接调用 permService.tree，是合理的用例分派，没有必要再制造 Controller→API 两层。

### 2.2 认证、授权、登录与 OAuth

[src/security/security.js:92](D:/MailServer/cloud-mail/mail-worker/src/security/security.js:92) 是统一入口，但存在四种不同认证语义：

| 入口 | 实际验证 | 后续范围 |
| --- | --- | --- |
| exclude 清单 | 使用 startsWith 放行 `/login`、`/register`、`/oauth`、`/oss`、`/webhooks`、`/init`、`/telegram` 等 | 各业务入口自行决定额外验证 |
| `/public/*` | KV `public_key:` 与原始 Authorization 完全相等 | 全站邮件查询/批量建用户；不是个人邮箱范围 |
| 普通会话 | HS256 JWT → `auth-uid:<userId>` KV → tokens 包含 JWT 内随机 token | `c.set('user', authInfo.user)`；部分路由再查 D1 权限 |
| OAuth setup / Telegram 查看 | 各 service 内验证签名 token | setup 另查 purpose/exp/provider/subject；Telegram 按 emailId 查邮件 |

普通权限由 requirePerms 与 premKey 两份路径清单决定。命中清单时，[src/service/perm-service.js:26](D:/MailServer/cloud-mail/mail-worker/src/service/perm-service.js:26) 联查 user、role、role_perm、perm，取按钮权限 key；管理员按 KV 中的用户 email 是否等于 `env.admin` 绕过限制。管理员不是一个固定的 roleId。前端 `*` 表示全权限，但后端主要依靠管理员邮箱判断。

[src/service/login-service.js:202](D:/MailServer/cloud-mail/mail-worker/src/service/login-service.js:202) 登录依次检查 D1 用户存在、isDel、BAN、密码，生成 UUID token，签发 `{userId,token,iat}` JWT。普通登录没有 exp；有效期依赖 KV 初始 30 天 TTL 和 security 的按日滑动刷新。tokens 名义限制约 10 个，当前 `length > 10` 后再 push 实际允许最多 11 个。KV 保存的是完整 user row，包含 password/salt 等内部字段。

[src/service/login-service.js:25](D:/MailServer/cloud-mail/mail-worker/src/service/login-service.js:25) 注册依次检查设置、地址/密码、注册码、账户占用、角色域名、Turnstile，再分别插 user、主 account、记录 IP、扣注册码、更新验证次数。返回 `{regVerifyOpen}`，不直接返回登录 token。管理员添加用户和 public 批量创建是独立路径，校验及写入方式并不完全一致。

[src/service/oauth-service.js:45](D:/MailServer/cloud-mail/mail-worker/src/service/oauth-service.js:45)、`:93`、`:145` 分别交换 LinuxDo/GitHub/Google code，再获取 provider 用户信息；saveUser 以 platform/oauthUserId 查写 D1。已绑定用户走普通 login 的免密码分支；未绑定返回 900 秒、purpose=`oauth-setup` 的证明。[src/service/oauth-service.js:14](D:/MailServer/cloud-mail/mail-worker/src/service/oauth-service.js:14) bindUser 校验证明目的/过期/provider/subject/开关及已有绑定，再复用注册、写 oauth.userId、登录。

前端专用回调 `/auth/google/callback`、`/auth/github/callback`、`/auth/linuxdo/callback` 位于静态 SPA，由 `mail-react/src/utils/oauth.ts` 校验 sessionStorage 中的 state/provider/精确 redirectUri 后调用 API；LinuxDo API 的既有拼写是 `/oauth/linuxDo/login`。Worker 接收 code/redirectUri，没有自己的 OAuth state 会话或回调路由。本次未发现“客户端任意 oauth ID 即可绑定”的旧漏洞；现有 setup 证明应保留，不能在迁移时退回旧方式。

### 2.3 异常与 HTTP 返回

[src/hono/hono.js:9](D:/MailServer/cloud-mail/mail-worker/src/hono/hono.js:9) 的 onError 区分 BizError 的日志级别，再按错误 message 字符串识别未绑定 KV/D1、D1 缺列，最终调用 `result.fail(err.message, err.code)`。[src/error/biz-error.js:2](D:/MailServer/cloud-mail/mail-worker/src/error/biz-error.js:2) 默认 payload code=501；[src/model/result.js:2](D:/MailServer/cloud-mail/mail-worker/src/model/result.js:2) 普通成功 `{code:200,message:'success',data}`，没有 truthy data 时为 null，失败 `{code,message}`。

普通业务错误和未捕获异常通常 **HTTP 200**，失败信息在 payload.code。本地实际 bundle 确认：无登录访问 `/api/email/list` 为 HTTP 200/code 401；坏 JSON 登录为 HTTP 200/code 500；CORS OPTIONS 为 204。普通接口没有设置登录 Cookie，也没有 Set-Cookie；前端使用 localStorage token、原始 Authorization，没有 Bearer。

这不是所有接口的统一协议：Resend webhook 由路由自己 catch，返回文本 200/500；init 返回文本；Telegram 返回 HTML 并加公开七天缓存；对象接口返回流；未知路由走 Hono 默认 notFound，但未认证访问可能先被 security 拦截；assets 与直接 KV 分派也不经过 Hono onError。

### 2.4 D1、Drizzle 与持久化

[src/entity/orm.js:3](D:/MailServer/cloud-mail/mail-worker/src/entity/orm.js:3) 每次调用 drizzle(c.env.db)，没有数据库全局连接池或持有请求 env 的 ORM 单例。多数 Service 自己承担查询、规则与跨表编排。唯一 [src/dao/analysis-dao.js:1](D:/MailServer/cloud-mail/mail-worker/src/dao/analysis-dao.js:1) 提供统计 raw SQL；analysisService 仍直接写部分 Drizzle 查询。因此当前真实边界是 **API→Service→Drizzle/raw D1**，不是完整 API→Service→DAO。

12 张业务表：user、account、email、attachments、star、role、perm、role_perm、reg_key、oauth、verify_record、setting。entity 是数据库映射，不是富领域对象。表关系由 ID 和业务约定维护，DDL 未定义业务外键/级联；删除依靠 service 调用链。user.type 指 role.roleId；reg_key 实际主键列拼写是 `rege_key_id`。

recipient/cc/bcc 是 TEXT 内 JSON 地址数组；D1 resend_tokens 是 JSON 字典字符串，KV setting 中已解析成对象。role.banEmail/availDomain 和多个过滤字段使用 CSV。emailId/accountId 为游标，用户列表为 offset 分页，不能统一成一套参数后声称兼容。

[src/init/init.js:6](D:/MailServer/cloud-mail/mail-worker/src/init/init.js:6) 的 `/init/:secret` 比较 jwt_secret 后运行 intDB 与 v1_1DB 到 v3_3DB 的全部历史步骤，最后刷新 setting KV；没有 drizzle-kit migration 目录、版本表或 schema 自动同步。迁移 SQL 和 Drizzle 声明必须一起读；当前两者确有类型、nullability、默认值差异，详见问题 F22。

Cloudflare D1 单次 batch 是事务批次，失败可回滚该批次；分离的 await/run 或多个 batch 不会形成整个业务事务，KV/R2/供应商调用也不会被一起回滚。[D1 batch 官方语义](https://developers.cloudflare.com/d1/worker-api/d1-database/)。

### 2.5 绑定、配置与状态

| 名称/来源 | 实际消费者及行为 |
| --- | --- |
| `db` | orm、init、analysisDao、public 批量写、附件删除、接收恢复的 raw SQL |
| `kv` | 会话、public token、setting 缓存、日发送统计、图表缓存；可兼任附件/背景对象存储 |
| `assets` | fetch 非 API/对象路径的静态资源响应 |
| `r2` | 可选；r2Service 当前 provider 为 R2 时访问 |
| `ai` / `ai_model` | aiService.extractCode；可选开启，模型输出失败退化为空 code |
| `email` | 可选外发；sendByCloudflareEmail 的 env.email.send |
| `domain/admin/jwt_secret` | 地址许可、管理员判断、JWT 与 init 验证；不能改名 |
| `analysis_cache/orm_log/project_link` | 统计缓存、SQL日志、公开配置中的项目链接开关；读取方式并不完全一致 |
| D1 setting + KV `setting:` | Resend/Turnstile/TG/S3/OAuth/推送/过滤/清理等设置与凭据 |

[src/service/setting-service.js:16](D:/MailServer/cloud-mail/mail-worker/src/service/setting-service.js:16) refresh 从 D1 获取整行、解析 resendTokens，写 Hono Context 和 KV；query 通常从 KV 读，转换 domainList/emailPrefixFilter 并放入当前 Context。缺 KV setting 即报数据库未初始化，没有自动 D1 回退。get 在同一对象上遮罩部分密钥并增加展示字段；websiteConfig 再选择公开字段。内部配置、持久格式、遮罩响应实际混在同一对象中。

模块级 Hono、schema、常量、service 对象和 TextEncoder 本身可以保留：多数没有跨请求保存 c/env/user。真正已复现的可变全局是 i18next 的语言。setting 的可变缓存主要是 **请求内** 对象复用，不能把它误报成全局跨用户配置对象。

email/scheduled 通过 `{env}` 调用共用 Service，没有 Hono req/get/set；query 用可选链兼容，其他方法未必兼容。这个 duck typing 是 TS 的主要边界之一。

对象写读删除都先经 [src/service/r2-service.js:7](D:/MailServer/cloud-mail/mail-worker/src/service/r2-service.js:7) 选择 **配置完整的 S3→env.r2→KV**。S3Client 和 Resend client 按调用创建，没有全局共享 client。R2 返回 object body/metadata，KV/S3 返回 Response，调用方目前没有统一类型。直接 `/attachments` 等路径固定读 KV，而 `/api/oss/*` 才经 provider 选择器。

### 2.6 邮件接收、发送和通知

入站链由 [src/email/email.js:16](D:/MailServer/cloud-mail/mail-worker/src/email/email.js:16) 执行：

```text
email(message, env, ctx)
 → setting/receive 开关 → 读取 raw → PostalMime
 → 主题/正文/发件人黑名单
 → exact account；找不到才 plus-address base fallback
 → 无人收件策略、角色域名/禁收规则
 → 可选 AI code
 → email.receive：SAVING(6)、isDel=1
 → 附件 key/对象/记录，CID 替换为 {{domain}} + key
 → completeReceive：isDel=0、RECEIVE(0) 或 NOONE(7)
 → 按 ruleType/ruleEmail 决定 TG/message.forward/webhook
```

查询包含软删除账户/用户，不应假设 receive handler 自动拒绝所有 isDel/BAN 用户；当前没有显式统一状态策略。无人收件允许时 userId/accountId=0，供管理端查看。附件 key 为 `attachments/` + 内容 SHA-256 前 16 字节的十六进制 + 扩展名；不要改变现存 key。

发送链由 [src/service/email-service.js:250](D:/MailServer/cloud-mail/mail-worker/src/service/email-service.js:250) 执行：

```text
POST /api/email/send
 → setting → 正文图片转 CID/读对象
 → 用户/角色、发件开关、次数、发件账户归属/域名
 → reply 按 emailId 取 messageId
 → 全站内：随后直接建收件副本
 → 存在任意站外：优先 env.email.send，否则该域名 Resend
 → 计数、写发件记录、保存正文/普通附件
 → 站内副本与状态 → KV 日期发送统计 → 返回单项 Mail[]
```

混合收件人走外发分支，不再额外生成站内副本；本次只记录现状，是否增加站内镜像应是独立产品决定。回复设置 in-reply-to/references；forward 是前端引用正文的写信模式，message.forward 是入站配置转发，两者不是同一 API。上传是 JSON/base64，不是 multipart/预上传；普通附件和正文图片各最多 10 个，但检查目前过晚。

站内投递直接写数据库，不依赖外部供应商；普通附件共享对象 key。SAVING 是入站中间状态，不是完善的业务操作日志；外发没有本地幂等 operation ID。

[src/service/resend-service.js:7](D:/MailServer/cloud-mail/mail-worker/src/service/resend-service.js:7) 从公开 `/webhooks` 接收事件，按 resendEmailId 改状态。[src/service/telegram-service.js:46](D:/MailServer/cloud-mail/mail-worker/src/service/telegram-service.js:46) 推机器人消息和签名查看 URL；[src/service/telegram-service.js:19](D:/MailServer/cloud-mail/mail-worker/src/service/telegram-service.js:19) 查看页读邮件、返回模板。[src/service/webhook-service.js:5](D:/MailServer/cloud-mail/mail-worker/src/service/webhook-service.js:5) 在 handler 内直接重试 HTTP 推送。AI/TG/转发/webhook 部分 catch 是有意让辅助能力降级，不能一概要求重新抛错；附件失败的处理则会损坏核心持久化完整性。

当前 Cloudflare Email Service 文档支持结构化 message builder，不能用旧版只接受 EmailMessage 的印象判定此处一定错误；真实账户能力仍需联调。[当前 Workers send API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)。Workers Web Crypto 支持 MD5，S3 的 MD5 middleware 也不能仅据 Node 的 Web Crypto 差异判错。[Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)。

### 2.7 定时、删除与统计

[src/index.js:28](D:/MailServer/cloud-mail/mail-worker/src/index.js:28) 按 cron 选择任务；普通配置每小时 `0 * * * *`，依次执行验证记录清理（仅 UTC 0 点）→日配额重置（仅 UTC 0 点）→恢复 SAVING 状态→autoClean→刷新图表缓存→清未绑定 OAuth。另有 `*/30 * * * *` 只刷统计的分支，但当前普通 TOML 没启用。dev 配置没有 triggers，不应把本地 dev 当作已验证 cron。

所有任务直接 await，返回 Promise 可以让 Worker 等待完成；没有 waitUntil **本身不是错误**。当前没有队列消费者、任务结果持久化、分步恢复点，前一任务抛错会阻断后续任务。

普通邮件/账户/个人注销按 syncDelete 分软删与物删；管理物删、条件批删、按账户删、按用户删、autoClean 各有不同链。附件删除先在 D1 判断引用，再删记录，再删对象；star 清理不一致。用户恢复只默认恢复用户/主邮箱，type 为真才扩大到邮件和其他账户。

统计 queryEcharts 联合 D1 总数/来源/过去15天查询和 KV 日期发送数。按 timeZone 构造 `analysis_echarts:` key，只在 analysis_cache 为 true 或字符串 'true' 时启用缓存。

## 3. 主要问题与技术债优先级

本报告 **P1** 表示应在大范围重构前优先纳入修复计划的安全/数据完整性/确定性可靠性问题；**P2** 表示应随边界收紧和测试建设解决；**P3** 表示暂不阻塞迁移。相同影响的子问题归并，避免用数量夸大问题。已存在的安全缺陷不是必须永久保留的兼容契约。

### 3.1 安全、认证与输入

**F01 · P1 · Telegram 查看页的持久 XSS。** [src/template/email-text.js:32](D:/MailServer/cloud-mail/mail-worker/src/template/email-text.js:32) 把不可信 text 直接插入 HTML；[src/template/email-html.js:7](D:/MailServer/cloud-mail/mail-worker/src/template/email-html.js:7) 仅移除 script，`:59` 再写 ShadowRoot.innerHTML，保留 onerror、javascript: 等可执行属性。Shadow DOM 不提供脚本安全隔离。真实模板本地实验确认这些内容保留；没有声称已验证线上浏览器攻击。当用户打开签名查看链接时可能执行邮件发件人提供的代码；同源页面能访问该 origin 的存储/接口。建议安全文本转义、经过验证的 HTML sanitize 与 sandbox/CSP/独立展示 origin 的适用组合。React 邮件页已有 DOMPurify 和 sandbox，不能推断 Telegram 模板获得了同样保护。

**F02 · P1 · 委托用户管理权限能接管管理员，主邮箱保护也分散。** [src/service/user-service.js:268](D:/MailServer/cloud-mail/mail-worker/src/service/user-service.js:268) setPwd→resetPassword 没有操作者/管理员目标限制；只要普通角色被授予 user:set-pwd，即可修改 env.admin 对应用户密码，再登录获取全部权限。setStatus/physicsDelete 同样能针对管理员。前端 AdminPage 的 type=0 编辑限制没有后端等价约束。[src/service/account-service.js:257](D:/MailServer/cloud-mail/mail-worker/src/service/account-service.js:257) 管理 deleteAccount 直接删主邮箱，而个人 delete 有保护；会留下 user 和 `loginUserInfo` 中 account.name 空引用。应把受保护目标和主邮箱不变量放进管理用例，不能依靠按钮或列表隐藏。此问题有委托权限的前提，不能说任何普通登录用户都能重置管理员。

**F03 · P1 · 注册可以占用他人的 plus-address。** [src/service/login-service.js:83](D:/MailServer/cloud-mail/mail-worker/src/service/login-service.js:83) 只检查 exact 地址；[src/service/account-service.js:60](D:/MailServer/cloud-mail/mail-worker/src/service/account-service.js:60) 新增邮箱已有 base 所有权检查；入站和站内投递都 exact-first。公开注册或合法 OAuth setup 的用户可以创建 victim+tag 为自己的主邮箱，使该 tag 后续邮件被转投。需要通过注册码、验证、角色域名等现有规则；OAuth 注册会覆盖普通 register 关闭开关并跳人机验证，但仍要求合法 setup 证明及注册码等规则。共享地址占用规则，保留合法自有 alias 与 plus fallback；不要取消整个 plus 功能。

**F04 · P1 · Resend webhook 未验证来源及事件顺序。** [src/api/resend-api.js:3](D:/MailServer/cloud-mail/mail-worker/src/api/resend-api.js:3) 直接 JSON→[src/service/resend-service.js:7](D:/MailServer/cloud-mail/mail-worker/src/service/resend-service.js:7)，没有签名/raw body 校验。掌握有效 resendEmailId 的调用者可伪造状态事件；不能把它夸大成只需任意数字 emailId 就能改所有邮件。未知事件默认回到 SENT，旧事件/重放可覆盖终态，没有 event ID、时间或状态迁移检查。应使用 raw body 与 Svix headers 验签，再做允许的事件/幂等更新。[Resend 验签要求](https://resend.com/docs/webhooks/verify-webhooks-requests)。

**F05 · P1 · logout 确定性删错会话并丢 TTL。** [src/service/login-service.js:259](D:/MailServer/cloud-mail/mail-worker/src/service/login-service.js:259) 未 await userContext.getToken；string 与 Promise 比较得到 -1，splice(-1,1) 删最后一个 token。真实函数实验 `[current,other]` 登出 current 后剩 current。随后 put 没有 expirationTtl，KV 的过期设置不会被原写入自动继承。普通 JWT 没 exp，影响更大。修复需测试单设备/多设备/未命中 token 与 TTL，而非只补 await 后结束。

**F06 · P1 · 管理物删遗漏撤销；会话生命周期有并发覆盖。** [src/service/user-service.js:110](D:/MailServer/cloud-mail/mail-worker/src/service/user-service.js:110) 不删 auth KV；个人 delete 才删。[src/security/security.js:124](D:/MailServer/cloud-mail/mail-worker/src/security/security.js:124) 信任 cached user，没有查数据库存在/status/isDel。管理物删后旧 JWT 仍通过认证；被删管理员的 cached email 仍能绕过权限，按日刷新也能继续延长 TTL。login/logout/refresh 对同一 KV 整个 tokens 数组读改写，会丢新登录、写回已撤销 token；KV 本身还是最终一致性。应先统一所有撤销入口，明确“立即撤销”或“允许传播窗口”的需求，再选 D1 会话/版本检查或串行化方案。无需无条件引入 Durable Objects。[KV 一致性限制](https://developers.cloudflare.com/kv/concepts/how-kv-works/)。

**F07 · P1 · 用户查询泄露密码哈希与 salt。** [src/service/user-service.js:160](D:/MailServer/cloud-mail/mail-worker/src/service/user-service.js:160) `select({...user,...})` 包含 password/salt，返回列表未做字段投影。本地真实 Drizzle 查询确认 SQL 选出了两字段。持 user:query 权限即可获取用户凭据材料，前端不显示不代表响应安全。应使用明确管理用户 DTO/允许字段，避免扩散内部 row。

**F08 · P1 · public 批量建用户 SQL 拼接。** [src/service/public-service.js:138](D:/MailServer/cloud-mail/mail-worker/src/service/public-service.js:138) 将 email/local part、UA、IP 等拼进 SQL 引号。合法邮箱可以含 apostrophe/pipe，验证并不保证 SQL 安全。本地 SQLite 实验：合法 o'hara 邮箱导致语法错误；`x'||'y@example.test` 会被作为表达式存成另一地址。入口需要 public token，仍是可靠性和信任边界问题；没有验证 D1 任意多语句执行。必须使用 prepare.bind，不能禁止合法邮箱字符来代替参数化。

**F09 · P1/P2 · 外部输入没有可靠运行时类型/范围校验。** [src/service/login-service.js:56](D:/MailServer/cloud-mail/mail-worker/src/service/login-service.js:56) 对 password.length 判断允许数字1绕过六位限制；真实函数实验已复现。[src/service/user-service.js:277](D:/MailServer/cloud-mail/mail-worker/src/service/user-service.js:277) status='1' 可由 SQLite 保存为禁用整数，但严格比较不触发 KV 撤销。缺失/null 字段造成 name.length、accountRow.email、roleRow.availDomain 等空引用；receiveEmail=[] 会 vacuously 满足 every，产生无收件的发件流程；permIds/banEmail/list/base64 未系统校验。多个 size 只限最大值，负数如 -1 可取消 SQLite LIMIT；public/star 没有效上限。需要 API 边界 unknown→DTO 的解析与 ID/枚举/分页/数组/大小约束。TS 类型注解不能验证 request JSON。新增拒绝规则是行为修复，单独与旧默认值做兼容评审。

**F10 · P2 · 异步返回值混用。** [src/service/reg-key-service.js:34](D:/MailServer/cloud-mail/mail-worker/src/service/reg-key-service.js:34) selectById 未 await，Promise truthy，允许不存在的角色注册码；真实函数已复现。[src/service/verify-record-service.js:71](D:/MailServer/cloud-mail/mail-worker/src/service/verify-record-service.js:71) 首次注册计数用 returning().run() 返回 D1Result，调用方读 row.count；新增邮箱分支却用 get。本地已确认结果结构不等于 row，阈值响应错误。这些是适合 TS 提前捕获的具体问题。

**F11 · P2 · 凭据与 token 用途缺少统一政策。** [src/utils/crypto-utils.js:18](D:/MailServer/cloud-mail/mail-worker/src/utils/crypto-utils.js:18) 密码仅一次 salted SHA-256，非具有工作因子的密码 KDF；随机初始密码用 Math.random；登录/public 管理员密码验证没有应用级节流，后者也没检查 BAN。个人改密码不撤销旧会话，管理改密码会撤销。Telegram token 无 purpose/exp、与 KV 会话撤销无关，且查看页 public cache 七天。普通登录 JWT 不含 emailId，不能据此声称用户可自行伪造任意邮件查看 token。init 将 JWT 签名密钥放 URL 兼作迁移密码，扩大 URL/日志暴露面的潜在影响。应分别设计会话、setup、public、邮件查看、初始化能力，保留旧哈希验证并渐进升级；不要在纯 TS 改动里突然更换哈希/登录有效期。

**F12 · P2 · 授权元数据分散、prefix 规则默认仅需登录。** [src/security/security.js:11](D:/MailServer/cloud-mail/mail-worker/src/security/security.js:11) exclude、requirePerms、premKey 手工维护，且未绑定 method。新路由忘加入清单时不会自动要求业务权限。部分现存 account 自身操作、role/selectUse 没特定权限可能是有意设计，不能泛称越权。适合把每条路由的 auth/perm 声明集中，并测试覆盖；精确匹配变化需要先检查当前前缀行为与真实路由。

### 3.2 邮件、附件与存储

**F13 · P1 · 外发成功后才校验附件，后续失败会诱发重发。** [src/service/email-service.js:361](D:/MailServer/cloud-mail/mail-worker/src/service/email-service.js:361) 调 provider，`:429` 加次数、`:435` 写发件记录，`:439`/`:447` 才检查 10 个上限。真实 send 隔离实验事件为 external-provider-send→insert-sent→attLimit。存储、站内副本或末尾 KV 失败也会让调用返回失败，但前面的投递无法撤回。应先完成 DTO、数量/大小/地址/图片归属校验，再创建可追踪操作、保留 provider receipt，并让重试识别已有发送。可利用供应商幂等能力，但不替代本地操作记录；其部署支持需单独确认。

**F14 · P1 · 入站 raw 被提前逐块解码，损坏字节。** [src/email/email.js:46](D:/MailServer/cloud-mail/mail-worker/src/email/email.js:46) 每块新 TextDecoder.decode 后拼字符串，再 PostalMime.parse。跨块 UTF-8 会变替换字符；binary transfer encoding 的字节也会损坏。真实 PostalMime 实验中 `[255,128,1,0,10]` 被改为 `[239,191,189,239,191,189,1,0,10]`。解析前应保持 raw stream/ArrayBuffer，检查库实际支持的输入；同时限制原始邮件/附件总量。字符串拼接还增加内存复制。

**F15 · P1 · 入站附件失败被宣告完成，恢复流程也不完整。** [src/service/att-service.js:15](D:/MailServer/cloud-mail/mail-worker/src/service/att-service.js:15) 先写对象后整批插引用；[src/email/email.js:153](D:/MailServer/cloud-mail/mail-worker/src/email/email.js:153) catch 后仍 completeReceive，可能接受邮件却失附件/留下孤儿对象。[src/service/email-service.js:1026](D:/MailServer/cloud-mail/mail-worker/src/service/email-service.js:1026) scheduled 的 completeReceiveAll 只改 status，未恢复 isDel=0；也没有年龄阈值/附件完成证明，可能碰到正在处理的 SAVING。不应简单“所有 SAVING 改正常”来修复。应区分接收持久化、附件阶段和可恢复失败，辅助通知失败可以继续降级。

**F16 · P1 · 站内副本缺少正文图片引用。** [src/service/email-service.js:453](D:/MailServer/cloud-mail/mail-worker/src/service/email-service.js:453) attList 只取 type=ATT，[src/service/email-service.js:747](D:/MailServer/cloud-mail/mail-worker/src/service/email-service.js:747) 给收件副本复制的也只有该列表；EMBED 引用不复制，但收件 HTML 引用同一 key。真实 attService/站内函数配合 ORM stub 的本地实验确认收件 HTML 有图片而附件引用数为0（未执行真实 D1 查询）。删除发件记录时对象看似只有一个引用，会删掉仍被收件正文使用的图片。站内副本必须登记全部实际引用，返回 UI 的普通 attList 仍可只展示普通附件。

**F17 · P1 · 删除引用判断漏清对象，错误后无重试依据，删除链不统一。** [src/service/att-service.js:215](D:/MailServer/cloud-mail/mail-worker/src/service/att-service.js:215) 仅选全库 COUNT(*)=1 的 key，然后删指定 field 的全部引用。同一邮件有同 key 两引用时不选对象、却把两引用全删，产生孤儿；本地真实 SQL 已复现。多个邮件按顺序删时最后一个单引用能够被选中，不能误说所有共享 key 都漏删。对象删除失败又 catch 吞掉，DB 引用已消失；并发新增引用还可能与对象清理竞态。[src/service/email-service.js:1134](D:/MailServer/cloud-mail/mail-worker/src/service/email-service.js:1134) 条件批删与按账户删不清 star，普通 ID 物删会清。应统一删除用例、在 DB 变更后判断剩余引用、持久化待清理任务/重试，并保护新增引用；不存在 D1+R2 通用分布式事务。

**F18 · P1/P2 · 存储返回形态、URL 与 provider 迁移耦合。** [src/api/r2-api.js:4](D:/MailServer/cloud-mail/mail-worker/src/api/r2-api.js:4) 对 KV/S3 Response 读取 R2 的 httpMetadata，丢 MIME/disposition/cache，missing object 空引用。本地调用确认 Content-Type 退化为 octet-stream、disposition='null'。r2Service 按当前配置选 provider，而 attachments 只存 key，切换后旧对象不可定位；直接附件 URL 又固定 KV。应统一 StoredObject/metadata/not-found 适配，冻结 key/URL；provider 切换需要明确搬迁、双读或来源记录，不能只改 Env 类型。/oss 缺失对象的 HTTP 语义修复应单独回归。

**F19 · P2 · 回复和正文旧对象缺少资源范围检查；文件内容可能成为同源主动内容。** [src/service/email-service.js:350](D:/MailServer/cloud-mail/mail-worker/src/service/email-service.js:350) reply 的 selectById 仅 emailId/isDel，不查 userId，可引用另一用户的 messageId/关联元数据；没有直接返回另一用户完整正文，不能夸大影响。[src/service/att-service.js:91](D:/MailServer/cloud-mail/mail-worker/src/service/att-service.js:91) 正文可给站内 key，经全库 selectOneByKeys 读取，没校验当前用户引用归属。对象 URL 当前是公开能力，知道 key 者能取对象，是否改私有需产品决定；正文转 CID 仍应有明确授权规则。附件 MIME/filename 来自外部，直接 KV/oss 路径与应用同源，SVG/HTML/inline 内容需要检查下载响应、nosniff/展示隔离政策。本次未执行浏览器文件攻击，按风险记录。

**F20 · P1/P2 · 附件 DTO 漂移和多阶段可变对象。** Compose 提供 contentType；[src/service/att-service.js:160](D:/MailServer/cloud-mail/mail-worker/src/service/att-service.js:160) saveSendAtt 读 att.type 作为 MIME，再把数据库 type 设为业务枚举；provider 转换则有 contentType/mimeType/type fallback。同一对象还逐步追加 buff/key/contentId/emailId 等，saveArticleAtt 删除 buff、imgReplace 改 type。实际外发 MIME 可能正常而持久化/下载 MIME 丢失。应区分 UploadAttachment、ParsedMimeAttachment、PreparedAttachment、AttachmentRow 和 ProviderAttachment，统一转换函数，不让同一个 type 同时表示 MIME 与业务类别。

### 3.3 数据库、配置、状态与错误

**F21 · P1 · 多步写入/配额检查缺原子边界。** register 的 user→account→updateUserInfo→邀请码扣减→验证码计数分离；注册码 check count 后减，没有条件 count>0，临界并发可负数；账户数/发件次数 check 后 write 可超额。OAuth 同一 proof 并发 bind 可以先各建 user、后无条件更新绑定；identity 的 `(platform,oauth_user_id)`、star 的 `(user_id,email_id)`、验证计数 `(ip,type)` 没唯一约束，查后插会重复。role 权限替换、setDefault、allReceive 两次写也可能中断/竞态。应为每个不变量选择 D1 batch、条件 UPDATE/唯一约束及 affected-row 检查，跨系统用可恢复步骤。加唯一约束前必须盘点和处理现有重复数据，不随 TS 自动生成迁移。

**F22 · P1 · init 缺版本/精确错误分类，实体映射与真实 SQL 不一致。** [src/init/init.js:39](D:/MailServer/cloud-mail/mail-worker/src/init/init.js:39)/`:62` 多列升级放进 batch，第一列已存在会回滚/跳过整批其他缺列；catch 把任何异常当“已存在”。重复 init 仍执行 auto_refresh=1→5、清以@开头的角色域名、补空公告等数据变换，不是无副作用幂等。内存真实升级链：fresh 建成12表；repeat 产生67条警告并改上述值；部分 v3_3 列已有时其余4列和时间索引不补齐。半升级实验 refresh 简化为 SELECT *；真实 refresh 选所有 Drizzle 列，可能末尾缺列报错，因此不能宣称实际 HTTP init 必定仍返回 success。

关键映射差异：

| 字段 | Drizzle 声明 | 当前全新 init SQL | 迁移影响 |
| --- | --- | --- | --- |
| verify_record.ip | integer | TEXT | IP字符串不能按 number建模 |
| oauth.platform | text/nullable | INTEGER NOT NULL DEFAULT0，运行时写字符串 | 需核对历史0与provider字符串 |
| attachments.status | text default0 | INTEGER | 编译期类型/默认值冲突 |
| user.sort/send_count | text/nullable | INTEGER NOT NULL | `$inferSelect` 与业务数字运算冲突 |
| role.key | NOT NULL | nullable，默认角色插NULL | TS推断可能承诺不存在的非空值 |
| setting.sync_delete | default1 | default0 | 自动schema生成会改变删除语义 |
| setting.send | default1 | default0 | 初始发件开关变化 |
| tg_msg_text/min_email_prefix | hide/0 | show/1 | 默认行为变化 |
| login_opacity | integer default0.88 | INTEGER NOT NULL default0.90，实际用小数 | 需按运行数据而非列名定类型 |
| email JSON/线程字段、多个 createTime | nullability有差异 | 部分更严格/更宽松 | 读取和插入类型都需核实 |

自动比对得到39项 type/null/default声明差异，未将 SQLite DATETIME 与 Drizzle text 的类型表示差异计入（部分 DATETIME 列存在空值约束差异），并非39个独立运行时 bug。应建立真实数据库 schema 快照与兼容映射；不能单以 entity 生成“最新schema”替换生产库。

**F23 · P1/P2 · setting 同对象遮罩、缓存标准化与密钥 DTO 混杂。** [src/service/setting-service.js:25](D:/MailServer/cloud-mail/mail-worker/src/service/setting-service.js:25) 直接返回 Context 缓存，get 原地遮罩，因此后续内部调用可能得到遮罩值；本地 sameObject=true 已确认。refresh 缓存原始 row，query 短路导致 domainList 缺失、emailPrefixFilter 还是字符串；setBlacklist 确实经该链返回形态不一致。get 遮罩部分密钥，却原样返回 OAuth clientSecret/webhookSecret 给 setting:query；公开 websiteConfig 选择字段，没有因此泄露这些密钥。建议分 StorageSetting、RuntimeSetting、PublicConfig、AdminConfigView、SettingPatch，禁止 view修改内部对象；保留空值/遮罩/patch 的既有语义。

**F24 · P1/P2 · domain 多种格式在不同路径解释不同。** [src/service/setting-service.js:35](D:/MailServer/cloud-mail/mail-worker/src/service/setting-service.js:35) 支持 JSON字符串，但 register/account.add/user.add/public.addUser 直接 env.domain.includes。字符串配置时是子串判断，例如 ample.com 能匹配 `['example.com']` 的文本。正常 Actions 会把占位替换为 TOML 数组，受影响的是 Dashboard 等字符串路径。集中解析/验证为只读 string[]，保留 env 名称与已有配置输入兼容；不要在每个 consumer各写转换。

**F25 · P2 · 全局语言状态与 import 初始化副作用。** [src/i18n/i18n.js:6](D:/MailServer/cloud-mail/mail-worker/src/i18n/i18n.js:6) 每请求 init 全局 i18next，所有 t 读它。真实源码/真实库交错实验确认英文请求 await 后得到中文；email/scheduled 沿用最近 HTTP 语言。资源初始化一次、每请求 fixed translator；事件显式默认语言。静态 import 图有三组循环：constants↔verifyRecord、setting/r2/s3、user/account/email/star/role/login/oauth/reg-key 八服务。当前延迟方法调用未必立即报 TDZ，但重构顶层初始化/隔离测试容易触发顺序问题。无用 const→service import 可小步移除；更大的循环通过查询/策略/工作流的单向依赖逐步拆。

**F26 · P2 · 错误模型和响应适配不稳定。** [src/hono/hono.js:16](D:/MailServer/cloud-mail/mail-worker/src/hono/hono.js:16) 把 JS 引擎字符串作为基础设施诊断，reading get 不一定就是 KV；未知错误 message 直接给调用者，潜在泄露内部 SQL/配置。transport200、payload401/403/501是当前契约，不能 TS迁移时统一改为真正4xx/5xx。result.ok(false/0/'') 被改成null，fail没有data；BizError与provider/Error没有一致类型。建议内部 discriminated error/稳定码，外部保留 legacy adapter，再另行决定 HTTP升级；JSON、文本、HTML、文件响应各有适配器。

### 3.4 性能、可运维性与可测试性

**F27 · P1/P2 · 发件末尾全站 KV 热 key 与配额时序。** [src/service/email-service.js:461](D:/MailServer/cloud-mail/mail-worker/src/service/email-service.js:461) 每封对 send_day_count:日期 读改写，丢并发增量；平台同一 key 写入受频率限制，可能在真实投递/D1完成后抛429，使前端误以为没发。统计失败应与投递结果分开，统计可从可靠事件/D1聚合；不能把 KV计数当强一致额度。KV 对并发写最后写覆盖及单 key 写频率的约束见 [官方写入文档](https://developers.cloudflare.com/kv/api/write-key-value-pairs/)。

**F28 · P2 · 定时任务缺恢复边界。** [src/index.js:34](D:/MailServer/cloud-mail/mail-worker/src/index.js:34) 任一步失败跳过后续任务；UTC0检查用运行时 Date 而非 scheduledTime，延迟/漏跑可能错过日重置。[src/service/oauth-service.js:237](D:/MailServer/cloud-mail/mail-worker/src/service/oauth-service.js:237) 每小时删所有未绑定身份，没有保留900秒setup窗口，整点前创建的有效证明会突然失效。autoClean 每批95但总 while无预算/检查点；积压大时长占用事件，拖延其后任务。应按任务分离结果、可重入/检查点、基于日期的配额政策和OAuth保留窗口；不是简单所有任务Promise.all，因为删除/修复存在顺序依赖。

**F29 · P2 · 图表缓存、列表与查询放大。** [src/service/analysis-service.js:38](D:/MailServer/cloud-mail/mail-worker/src/service/analysis-service.js:38) KV list 只读第一页，没 cursor/list_complete；refresh Promise.all 无并发上限；缓存timeZone无TTL/数量限制，非法时区触发异常。15天SQL使用当前日固定UTC偏移，跨DST窗口可能日边界错误。三个 day-count SQL高度重复，可共享参数化构造；这里偏移来自数值计算，未确认可SQL注入。邮件摘要在无text时仍取整段HTML再linkedom处理，并非所有大正文都避开；front full/brief二次查询、每页total count、站内逐邮件逐附件insert都有放大成本。优先验证输入上限、真实查询计划/row scan和批次，不凭文件长短要求全表缓存或重做分页。

**F30 · P2 · 第三方调用无明确预算、重试/结果政策。** OAuth/Turnstile/provider/AI/TG/webhook在业务方法内直接await。部分响应只有res.ok，缺 DTO解析；webhook retry不封顶、无间隔/timeout/idempotency，坏配置可长时间阻塞入站；Telegram全并发，附件hash/base64/MIME/HTML转换增加内存峰值。建议 provider adapter负责输入输出/timeout/error，use-case明确必需与可降级操作。先做有限重试和可观测结果，只有确需异步可靠通知时再引入队列/持久outbox。

**F31 · P2 · 超长函数的责任混合影响测试与开发。** email-service 1,150行，send 224行、HandleOnSiteEmail 135行；email handler188行；register124行；user.list121行；init747行。问题在于同时做权限、DTO转换、SQL、外发、存储、计数、通知和返回组装，已有缺陷F13/F16/F21说明边界不清有真实成本。模板135行主要是HTML，不按同标准认定业务复杂。service接收完整c、共享this对象、跨服务互环，测试只能替换import/大面积stub；应按工作流/能力拆分依赖，而非按固定行数拆文件。

**F32 · P1（迁移前基线）· 测试入口和发布检查不足。** Worker test脚本会部署；Vitest指不存在配置且还是Hello World；没有lint/typecheck/build脚本；Actions直接构建部署再init，没有当前Node回归/类型/权限测试关卡。已有17项Worker测试主要保护附件路由、OAuth证明和绑定恢复，覆盖价值真实，但未覆盖D1邮件/会话/删除/并发。本阶段不修这些配置，避免把审计悄悄变成工具链迁移；下一阶段先建立安全测试入口。

## 4. TypeScript 迁移复杂度、收益、成本与风险

### 4.1 规模与实际类型探查

src 共82个 JS文件、**7,416物理行**（包含空行，末尾换行不额外计行）；无现有TS业务源码。22个service约4,301行，18个API约407行，13个entity含orm约250行。最大的10文件及函数已在问题F31与本地metrics证据记录。

本次用已安装 TypeScript **5.9.3** 运行一次不写项目配置的 strict/checkJs/noEmit 探查：ES2022+WebWorker库、Bundler resolution、全src。共709条src诊断，其中491个隐式参数any、13个destructuring any、67个动态属性错误、47个可能undefined、39个catch unknown，另有真实Drizzle default不匹配等。诊断数不等于709个bug，也不代表未来TS改名后固定的工作量；c/env仍未显式建模，不能把此实验当正式Worker typecheck。

同时 `wrangler types` 使用dev配置成功生成运行时/Env类型，证明绑定强类型可直接接入。但dev没有r2/ai/email，且vars推断为示例字面量；生产/test能力不同，需生成完整部署类型或使用明确可选能力层，不能盲用dev Env覆盖所有环境。

### 4.2 哪些能直接获得强类型，哪些难迁移

| 领域 | 可直接利用 | 实际困难/建议 | 复杂度 |
| --- | --- | --- | --- |
| Worker入口/Bindings | Wrangler runtime types、ExportedHandler、D1/KV/R2/Fetcher/Ai/Email事件类型 | 可选绑定、不同配置能力、vars string/boolean/array；与旧compatibility_date/运行库能力核对 | 低～中 |
| Hono/API | Hono Bindings/Variables、Context、明确Query/Body/Path DTO | 未认证路径不一定有user；query全是string；运行时验证需要另建边界 | 中 |
| JWT/会话 | WebCrypto类型、Claims union、KV session DTO | verify的JSON必须narrow；普通会话/setup/TG不同purpose/exp；历史KV坏数据/TTL兼容 | 中 |
| Drizzle | `$inferSelect/$inferInsert`、SQL投影/聚合类型 | 声明与DDL偏差、CSV/JSON TEXT、join nullable、原地row变DTO；raw D1不会自动推断SQL结构 | 中～高 |
| 设置 | Storage/Runtime/View/Patch分别建模 | context/KV/D1格式不同、遮罩和留空语义、0/1/2开关方向不同 | 高 |
| 附件/对象 | R2/KV/SDK类型、StoredObject标准接口 | string/base64/ArrayBuffer/Uint8Array、type二义性、metadata、nullable对象、provider来源 | 高 |
| Workers AI | binding.run输入输出的模型类型 | 动态ai_model、不同模型结果形态、输出JSON不可信，需校验与降级 | 中 |
| Resend/Email Service | SDK request/response、运行时Email类型 | receipt≠实际delivered；不能混用附件格式；供应商失败/部分成功/重试 | 中～高 |
| OAuth/Turnstile/webhook | 窄provider DTO、Response解析为unknown | 三家动态userinfo、code交换错误、identity保存字段白名单、signature raw body | 中 |
| email/scheduled共用Service | 明确事件handler与RuntimeDeps | `{env}`不是Hono Context；req/get/set不可强行as any；需提取请求metadata/translator | 高 |
| Error/API response | 内部错误union、legacy response union | transport/payload不一致是兼容行为，HTML/text/stream不能套一个JSON泛型 | 中 |

整体判断：**语法与工具链迁移中等，安全渐进迁移中等偏高；邮件/数据一致性重构高。** 成本主要来自契约与数据核实、失败/并发测试、DTO转换和副作用编排，非文件改后缀。基线建设、类型标注、行为修复各有独立工作包，不宜按82文件平均估时。本次尚未拥有生产数据分布和联调环境，不能给可信的精确人日承诺。

直接收益包括提前识别Promise/string、D1Result/row、nullable join、错用metadata、字段type漂移和返回DTO遗漏；新增API/字段可追踪编译影响，service依赖可注入，前后端契约可共享。类型收益最大的点恰是当前动态对象，不应通过大量any、non-null assertion或一份万能Context消除警告。

主要风险包括“正确推断错误schema”、改变默认值/软删规则、遗漏旧KV格式、误把所有JWT加exp、将HTTP200失败改为4xx、把原始Authorization改Bearer、把接口JSON字符串字段改数组、绑定名称或URL/key变化，以及转换测试loader失效。引入类型检查本身不应触发D1迁移。

## 5. 推荐目标架构与现有目录取舍

采用 **保留技术骨架、对复杂领域局部模块化** 的方案。第一轮不必搬所有文件。

| 当前目录 | 建议 |
| --- | --- |
| api | 保留，明确Controller职责：参数解析/验证、身份取得、use-case调用、响应适配；无需新Controller层 |
| hono | 保留app factory、middleware、错误适配；逐步把副作用注册改成显式registerRoutes(app)，可为测试创建独立app |
| security | 保留，集中session/public/setup/view政策；资源所有权/受保护目标仍在业务用例执行 |
| service | 保留小模块；拆email大服务的发送/查询/站内投递/删除协调，避免每个方法都直接持完整Hono Context |
| dao | 保留analysis专用SQL；复杂/复用查询逐步抽repository/query模块，小service无需强制配同名DAO |
| entity | 保留Drizzle映射，先校对真实schema；读行与DTO分开，domain状态不要伪装为数据库实体 |
| email | 作为Email事件adapter，调用receive workflow；HTTP/send与入站共享纯转换/策略/存储能力 |
| init | 保留兼容入口，但迁移执行器/历史步骤/状态检查逐步拆开；与类型迁移解耦 |
| utils/lib | 保留真正纯函数和查询投影；含绑定/业务权限/外部调用的能力不继续塞工具层 |
| error/model/const | 小而清楚，可暂时保留；未来统一HTTP适配/contract包时再合并，当前目录名无重写价值 |
| template | 保留展示职责，修安全边界；与纯MIME转换分开 |

目标依赖方向：

```text
fetch/email/scheduled adapters
  → HTTP parsing + auth / event metadata
  → use-cases: register、bind、send、receive、delete、maintenance
  → policies + queries/repositories + provider/storage/session interfaces
  → D1/KV/R2/S3/Resend/Cloudflare/Turnstile adapters

共享 contracts、纯转换/常量、错误定义不反向依赖 service/app。
```

优先可抽的边界：

- mail-send：验证/准备、额度、站内投递、外发provider、receipt及发送记录；mail-query独立保留已有游标/投影。
- mail-receive：raw MIME解析、收件归属/过滤、邮件与附件阶段、完成/恢复；notification采用明确降级政策。
- attachment-store：输入转换、key/metadata、引用登记与对象能力；cleanup协调D1引用和对象清理任务。
- auth/onboarding：共享地址占用/注册规则，login不再承担所有注册与绑定编排；session存储与密码验证分开。
- config：D1/KV解析及不可变RuntimeSetting，与管理/公开响应DTO分开。

基础能力接受窄依赖，例如 `{env, db, clock, logger}`/接口实例，而非任意c；仅HTTP层使用Hono Context。translator/request IP/UA由adapter提供。工厂可按env创建，模块级纯对象可以保留，避免为追求DI引入重量容器/全局mutable env。

存储统一读对象类型应包含body、metadata、length/etag和不存在结果；provider接口应返回明确receipt/error，不声称所有send成功就DELIVERED。暂不要求全站领域目录化、队列化或拆微服务。

## 6. 已执行的迁移安全基线

环境：Node **24.13.0**、pnpm **11.19.0**、直接Wrangler **4.90.0**；使用现有lockfile，无升级依赖。

| 检查 | 实际结果 | 能证明/不能证明 |
| --- | --- | --- |
| Worker `pnpm install --frozen-lockfile` | 通过，依赖已存在且无需更新 | 当前机器lockfile一致；不是空机器完整下载测试 |
| React同命令 | 通过 | 同上，为Worker assets提供构建链 |
| React `pnpm run build` | 通过，含tsc -b/Vite/PWA | 前端类型/打包通过；两个>500kB chunk提示非失败 |
| React `pnpm run lint` | 通过 | 前端检查；Worker没有lint script |
| 3个Worker Node测试 | 17/17通过 | 附件分派、OAuth setup、绑定恢复；非完整D1/邮件联调 |
| 2个React Node测试 | 17/17通过 | OAuth callback、Turnstile工具契约 |
| Worker `pnpm exec vitest run` | 失败，在收集前找不到wrangler.jsonc | test/index.spec仍Hello World，即使改路径也不能算业务回归 |
| `wrangler deploy --dry-run --config wrangler-dev.toml` | 通过，bundle3020.80KiB/gzip619.75KiB | 本地打包、D1/KV/assets声明识别；无ai/r2/email测试 |
| 同命令默认wrangler.toml | 通过，执行前端build hook | 仅声明ai/assets；db/kv/domain/admin/jwt_secret注释，不是完整运行配置 |
| `wrangler types … --config wrangler-dev.toml` | 通过，写忽略目录 | 可生成绑定/运行时类型，不代表业务TS通过 |
| 临时strict checkJs | 709诊断 | 迁移难点探查；未加正式tsconfig/check脚本 |
| Wrangler dev本地workerd启动与HTTP冒烟 | 通过；SPA200、未认证API HTTP200/code401、OPTIONS204、坏JSON HTTP200/code500、缺附件404；无Set-Cookie | 隔离本地persist目录，未init/发信/调用scheduled；不证明D1业务或云服务联调 |
| 实际bundle本地fetch | CORS/i18n/security顺序、401/坏JSON/OPTIONS/SPA分派符合上述记录 | 使用假KV/assets，无真实D1写入 |
| 内存SQLite/函数实验 | 复现迁移/引用/认证/模板/字节等局部问题 | 仿D1 batch事务；平台并发、资源权限仍待真实本地workerd与受控联调 |
| git diff --check | 通过（报告完成后复核） | 本次交付无业务代码改动 |

Worker没有独立build/typecheck/lint script。**没有执行 pnpm test、deploy、远程init或任何生产写入。** Wrangler dev、默认配置的dry-run通过不验证资源ID归属；test TOML有示例绑定，action TOML需要替换占位符，本次只静态核查两者，没有伪造生产配置来宣称可部署。

Workers Builds prepare脚本仅WORKERS_CI=1启用，当前严格要求分支frontend-react-rewrite；Actions走另一条配置替换/查建资源路径。后续改入口.ts/构建hook时必须同时保持assets输出、原db/kv/r2/email binding恢复。默认keep_vars不补缺失资源绑定。CI版本与本地锁定版本可保留，工具链升级另做。

## 7. 迁移前最低回归策略与不可变契约

### 7.1 契约保护清单

| 维度 | 必须锁定的现状 |
| --- | --- |
| URL/method | 附录65条API、/api前缀剥离、三种静态对象路径、SPA分派、专用OAuth callback；保留linuxDo拼写 |
| Query/Path | emailId/accountId/lastSort/size/timeSort/full/allReceive、num/size、CSV emailIds/userIds/regKeyIds、init secret、Telegram token、oss key；默认值/缺参分别记录 |
| Body | login/register/addAccount/send/role/settings等真实字段；send receiveEmail数组、text/content、accountId/sendType/emailId、JSON base64 attachments；现有send不消费CC/BCC |
| 响应 | transport与payload独立断言；普通ok envelope、fail缺data、send Mail[]、注册regVerifyOpen、brief/full字段、latestEmail、star只list；HTML/text/流另测 |
| Header/Cookie | 原始Authorization、accept-language、Content-Type、CORS/OPTIONS、Content-Disposition/缓存；登录无Cookie/Set-Cookie；不能擅加Bearer/凭据Cookie |
| JWT/登录状态 | auth-uid结构、30天TTL/滑动、多个tokens、普通JWT当前无exp；setup purpose/provider/subject/900秒；前端localStorage与oauthSetup分开 |
| OAuth | 三回调精确URI/state/provider、清理URL code、后台enabled与证明校验；顺序replay和并发绑定分开验证 |
| D1 | 现存schema/index/default/null、CSV/JSON TEXT、role/type关系、大小写唯一索引、rege_key_id、软/物删/恢复与无人收件0归属 |
| KV | auth-uid:、setting:、public_key:、send_day_count:YYYY-MM-DD、analysis_echarts:编码时区；旧JSON可读/TTL不丢 |
| 对象 | attachments/hash+扩展名、static/background/、{{domain}}、metadata与canonical/legacy URL；共享普通/CID引用和最后引用删除 |
| Bindings/env | db/kv/assets/r2/ai/email，domain/admin/jwt_secret/ai_model/analysis_cache/orm_log/project_link；既有云资源ID不可被新建替代 |
| 配置更新 | 0/1/2开关具体含义、CSV↔数组、resendTokens merge/空值删除、密钥遮罩与各字段留空语义；配置查询不得修改内部密钥 |
| 收发/维护 | exact→base、合法plus alias、noRecipient、角色过滤、SAVING两阶段、站内/外发/混合/回复、provider失败、附件失败、cron日界/autoClean排除 |

不要将现有TS前端interface当作完整契约：UserList/config/role仍有any，Mail.optional字段无法表达brief/full全部差异。应从真实响应和消费者共同建模；密钥泄露/越权/错误副作用的修复需要明确变更预期，不能作为必须保持的快照。

### 7.2 最低可行测试组合

优先修复Vitest配置和模板，或者搭建等价的真实bundle+本地workerd/D1/KV测试入口；现有Node局部测试继续保留。provider fetch/Email/AI/TG外部调用使用stub，数据库查询/约束/批次使用真实本地D1。Node内存SQLite可用于快速定位，但不作为唯一Cloudflare兼容证据。不要先构建庞大的端到端平台。

| 最小测试包 | 核心案例/断言 |
| --- | --- |
| HTTP契约与路由 | 每个method/path的参数来源、认证/权限声明覆盖；成功/失败envelope、OPTIONS、404/405、语言、无Cookie、文件headers与旧URL |
| 会话与授权 | 双设备logout只撤销目标且TTL正确；改密码/禁用/个人软物删/管理物删；普通角色允许/拒绝矩阵；管理员目标/主邮箱保护；query无password/salt |
| 注册/账号/OAuth | password string/number/null；邀请码required/optional/过期；domain array/JSON string；合法自有alias/拒绝他人alias；临界配额与并发bind/identity；cron在setup期间运行 |
| 发件 | 站内/站外/混合/回复；空收件/非法地址/超限；所有验证失败provider调用次数=0；provider已接受后DB/存储/KV失败重试不重复发送；额度并发 |
| 收件与附件 | raw跨块UTF8/binary/base64 MIME、exact/base/noone/过滤；SAVING中断恢复；CID/普通附件；站内发送→删发送方→收件图片仍可读 |
| 删除与对象 | 一key多邮件、多引用同邮件、最后一引用、star清理、存储删除失败可重试；KV/R2/S3 metadata/notfound/URL；provider切换显式策略 |
| settings与维护 | query→get→query、refresh→query形态稳定；密钥patch/遮罩/公开字段；日界配额、清理exclude/批次预算、统计timeZone/分页/缓存 |
| DB升级与旧数据 | fresh→repeat无非预期数据变化；代表性历史版本→最新、半升级可恢复；schema/index快照、大小写/JSON/CSV/null；旧KV会话和对象key仍可读 |

最低发布门槛：修复涉及的上述测试先通过，Worker正式typecheck/lint与全部Node回归通过，React build/lint通过，开发及解析后的目标配置dry-run通过；数据库或provider变化另外完成受控环境联调。类型-only改动不允许悄悄改schema/外部契约。真实邮件/OAuth联调只在明确的测试资源和身份上做，当前阶段没有做。

快照只稳定化有价值的响应字段、SQL schema与key，不盲存时间/随机token或密码材料。安全缺陷先添加修复目标测试；与记录旧正常流程的characterization测试分开，防止“测试通过”意味着继续保留漏洞。

## 8. 推荐迁移顺序、风险控制与阶段出口

| 顺序 | 工作包 | 出口标准 |
| --- | --- | --- |
| 0 | 保存method/path/response、schema/KV/key/config基线；修安全测试入口/CI；为自动init建立门禁，识别已完成升级与重复数据变换 | 关键正常流程可复现；不部署的test命令明确；纯TS发布不重新改写历史数据 |
| 1 | 按风险分小包独立修P1：TG模板、管理员目标/会话撤销、密码材料DTO与关键runtime校验、alias/webhook/SQL bind、发件/raw/CID引用、额度与OAuth原子不变量；约束重复init数据变换 | 每个修复有触发/失败/归属或并发测试，外部行为变化明确；不合成全面TS重构大包 |
| 2 | 增加Worker TS工具链和完整runtime/Env、contracts/error/DTO；allowJs桥接，已迁移文件strict | 生成类型能力正确、正式noEmit检查通过；未迁JS明确边界，不能全局any |
| 3 | 纯常量/纯utils/投影与schema映射渐迁 | 每次转换保持序列化/默认/存储；schema改正不触发生产DDL |
| 4 | 配置与存储/provider/session adapter；解决row/runtime/view和对象union | HTTP与email/scheduled都能通过窄依赖调用；旧keys/配置仍兼容 |
| 5 | 显式app/routes、安全上下文/API DTO边界，迁小service | 每条路由auth/perm覆盖，错误仍经legacy响应适配；Controller无需新增 |
| 6 | 发送、接收、站内投递、删除分步拆用例/查询；减少Service互环 | failure injection/并发/引用完整性通过，provider receipt与补偿可追踪 |
| 7 | 版本化DB升级/任务恢复/缓存优化及剩余TS | 旧库/半升级/任务日界验证通过；独立数据库迁移方案，明确回退边界 |

步骤1可以在原JS完成小修；步骤2～5与已保护的小模块可穿插，但不能将修复、文件搬迁、类型注解、schema变更合成一个难审PR。历史init复杂且涉及数据，完整执行器重构暂后置，但它的schema快照、自动init门禁和重复数据变换风险必须从步骤0～1处理；否则每次Actions部署仍会触发这些风险。

每个工作包保留正常API与持久格式；确需改变HTTP状态、鉴权能力、邮箱占用或错误返回时，单独列出前端/外部调用者影响。回退代码版本不会撤销已经发出的邮件、已经删掉的对象或schema数据变换；发送/清理/数据库修复需要自己的恢复策略，不能只写“可git revert”。

本阶段到此停止。尚未开始任何TypeScript迁移或业务重构，也没有为展示成果修补生产代码；下一阶段应先选定基线与P1修复工作包。

## 附录 A：全部 API method/path 基线

下表由本次源码AST提取；只表示路由注册，认证、参数、返回和副作用以报告调用链为准。

| Method | URL | 注册位置 |
| --- | --- | --- |
| GET | `/api/account/list` | [src/api/account-api.js:6](D:/MailServer/cloud-mail/mail-worker/src/api/account-api.js:6) |
| DELETE | `/api/account/delete` | [src/api/account-api.js:11](D:/MailServer/cloud-mail/mail-worker/src/api/account-api.js:11) |
| POST | `/api/account/add` | [src/api/account-api.js:16](D:/MailServer/cloud-mail/mail-worker/src/api/account-api.js:16) |
| PUT | `/api/account/setName` | [src/api/account-api.js:21](D:/MailServer/cloud-mail/mail-worker/src/api/account-api.js:21) |
| PUT | `/api/account/setAllReceive` | [src/api/account-api.js:26](D:/MailServer/cloud-mail/mail-worker/src/api/account-api.js:26) |
| PUT | `/api/account/setAsTop` | [src/api/account-api.js:31](D:/MailServer/cloud-mail/mail-worker/src/api/account-api.js:31) |
| GET | `/api/allEmail/list` | [src/api/all-email-api.js:5](D:/MailServer/cloud-mail/mail-worker/src/api/all-email-api.js:5) |
| DELETE | `/api/allEmail/delete` | [src/api/all-email-api.js:10](D:/MailServer/cloud-mail/mail-worker/src/api/all-email-api.js:10) |
| DELETE | `/api/allEmail/batchDelete` | [src/api/all-email-api.js:15](D:/MailServer/cloud-mail/mail-worker/src/api/all-email-api.js:15) |
| GET | `/api/allEmail/latest` | [src/api/all-email-api.js:20](D:/MailServer/cloud-mail/mail-worker/src/api/all-email-api.js:20) |
| GET | `/api/analysis/echarts` | [src/api/analysis-api.js:5](D:/MailServer/cloud-mail/mail-worker/src/api/analysis-api.js:5) |
| GET | `/api/email/list` | [src/api/email-api.js:7](D:/MailServer/cloud-mail/mail-worker/src/api/email-api.js:7) |
| GET | `/api/email/latest` | [src/api/email-api.js:12](D:/MailServer/cloud-mail/mail-worker/src/api/email-api.js:12) |
| DELETE | `/api/email/delete` | [src/api/email-api.js:17](D:/MailServer/cloud-mail/mail-worker/src/api/email-api.js:17) |
| GET | `/api/email/attList` | [src/api/email-api.js:22](D:/MailServer/cloud-mail/mail-worker/src/api/email-api.js:22) |
| POST | `/api/email/send` | [src/api/email-api.js:27](D:/MailServer/cloud-mail/mail-worker/src/api/email-api.js:27) |
| PUT | `/api/email/read` | [src/api/email-api.js:32](D:/MailServer/cloud-mail/mail-worker/src/api/email-api.js:32) |
| GET | `/api/init/:secret` | [src/api/init-api.js:4](D:/MailServer/cloud-mail/mail-worker/src/api/init-api.js:4) |
| POST | `/api/login` | [src/api/login-api.js:6](D:/MailServer/cloud-mail/mail-worker/src/api/login-api.js:6) |
| POST | `/api/register` | [src/api/login-api.js:11](D:/MailServer/cloud-mail/mail-worker/src/api/login-api.js:11) |
| DELETE | `/api/logout` | [src/api/login-api.js:16](D:/MailServer/cloud-mail/mail-worker/src/api/login-api.js:16) |
| GET | `/api/my/loginUserInfo` | [src/api/my-api.js:6](D:/MailServer/cloud-mail/mail-worker/src/api/my-api.js:6) |
| PUT | `/api/my/resetPassword` | [src/api/my-api.js:11](D:/MailServer/cloud-mail/mail-worker/src/api/my-api.js:11) |
| DELETE | `/api/my/delete` | [src/api/my-api.js:16](D:/MailServer/cloud-mail/mail-worker/src/api/my-api.js:16) |
| POST | `/api/oauth/linuxDo/login` | [src/api/oauth-api.js:5](D:/MailServer/cloud-mail/mail-worker/src/api/oauth-api.js:5) |
| POST | `/api/oauth/github/login` | [src/api/oauth-api.js:10](D:/MailServer/cloud-mail/mail-worker/src/api/oauth-api.js:10) |
| POST | `/api/oauth/google/login` | [src/api/oauth-api.js:15](D:/MailServer/cloud-mail/mail-worker/src/api/oauth-api.js:15) |
| PUT | `/api/oauth/bindUser` | [src/api/oauth-api.js:20](D:/MailServer/cloud-mail/mail-worker/src/api/oauth-api.js:20) |
| POST | `/api/public/genToken` | [src/api/public-api.js:5](D:/MailServer/cloud-mail/mail-worker/src/api/public-api.js:5) |
| POST | `/api/public/emailList` | [src/api/public-api.js:10](D:/MailServer/cloud-mail/mail-worker/src/api/public-api.js:10) |
| POST | `/api/public/addUser` | [src/api/public-api.js:15](D:/MailServer/cloud-mail/mail-worker/src/api/public-api.js:15) |
| GET | `/api/oss/*` | [src/api/r2-api.js:4](D:/MailServer/cloud-mail/mail-worker/src/api/r2-api.js:4) |
| POST | `/api/regKey/add` | [src/api/reg-key-api.js:6](D:/MailServer/cloud-mail/mail-worker/src/api/reg-key-api.js:6) |
| GET | `/api/regKey/list` | [src/api/reg-key-api.js:11](D:/MailServer/cloud-mail/mail-worker/src/api/reg-key-api.js:11) |
| DELETE | `/api/regKey/delete` | [src/api/reg-key-api.js:16](D:/MailServer/cloud-mail/mail-worker/src/api/reg-key-api.js:16) |
| DELETE | `/api/regKey/clearNotUse` | [src/api/reg-key-api.js:21](D:/MailServer/cloud-mail/mail-worker/src/api/reg-key-api.js:21) |
| GET | `/api/regKey/history` | [src/api/reg-key-api.js:26](D:/MailServer/cloud-mail/mail-worker/src/api/reg-key-api.js:26) |
| POST | `/api/webhooks` | [src/api/resend-api.js:3](D:/MailServer/cloud-mail/mail-worker/src/api/resend-api.js:3) |
| POST | `/api/role/add` | [src/api/role-api.js:7](D:/MailServer/cloud-mail/mail-worker/src/api/role-api.js:7) |
| PUT | `/api/role/setDefault` | [src/api/role-api.js:12](D:/MailServer/cloud-mail/mail-worker/src/api/role-api.js:12) |
| PUT | `/api/role/set` | [src/api/role-api.js:17](D:/MailServer/cloud-mail/mail-worker/src/api/role-api.js:17) |
| GET | `/api/role/tree` | [src/api/role-api.js:22](D:/MailServer/cloud-mail/mail-worker/src/api/role-api.js:22) |
| DELETE | `/api/role/delete` | [src/api/role-api.js:27](D:/MailServer/cloud-mail/mail-worker/src/api/role-api.js:27) |
| GET | `/api/role/list` | [src/api/role-api.js:32](D:/MailServer/cloud-mail/mail-worker/src/api/role-api.js:32) |
| GET | `/api/role/selectUse` | [src/api/role-api.js:37](D:/MailServer/cloud-mail/mail-worker/src/api/role-api.js:37) |
| PUT | `/api/setting/set` | [src/api/setting-api.js:6](D:/MailServer/cloud-mail/mail-worker/src/api/setting-api.js:6) |
| GET | `/api/setting/query` | [src/api/setting-api.js:11](D:/MailServer/cloud-mail/mail-worker/src/api/setting-api.js:11) |
| GET | `/api/setting/websiteConfig` | [src/api/setting-api.js:16](D:/MailServer/cloud-mail/mail-worker/src/api/setting-api.js:16) |
| PUT | `/api/setting/setBackground` | [src/api/setting-api.js:21](D:/MailServer/cloud-mail/mail-worker/src/api/setting-api.js:21) |
| DELETE | `/api/setting/deleteBackground` | [src/api/setting-api.js:26](D:/MailServer/cloud-mail/mail-worker/src/api/setting-api.js:26) |
| PUT | `/api/setting/setBlacklist` | [src/api/setting-api.js:31](D:/MailServer/cloud-mail/mail-worker/src/api/setting-api.js:31) |
| POST | `/api/star/add` | [src/api/star-api.js:6](D:/MailServer/cloud-mail/mail-worker/src/api/star-api.js:6) |
| GET | `/api/star/list` | [src/api/star-api.js:11](D:/MailServer/cloud-mail/mail-worker/src/api/star-api.js:11) |
| DELETE | `/api/star/cancel` | [src/api/star-api.js:16](D:/MailServer/cloud-mail/mail-worker/src/api/star-api.js:16) |
| GET | `/api/telegram/getEmail/:token` | [src/api/telegram-api.js:4](D:/MailServer/cloud-mail/mail-worker/src/api/telegram-api.js:4) |
| DELETE | `/api/user/delete` | [src/api/user-api.js:7](D:/MailServer/cloud-mail/mail-worker/src/api/user-api.js:7) |
| PUT | `/api/user/setPwd` | [src/api/user-api.js:12](D:/MailServer/cloud-mail/mail-worker/src/api/user-api.js:12) |
| PUT | `/api/user/setStatus` | [src/api/user-api.js:17](D:/MailServer/cloud-mail/mail-worker/src/api/user-api.js:17) |
| PUT | `/api/user/setType` | [src/api/user-api.js:22](D:/MailServer/cloud-mail/mail-worker/src/api/user-api.js:22) |
| GET | `/api/user/list` | [src/api/user-api.js:27](D:/MailServer/cloud-mail/mail-worker/src/api/user-api.js:27) |
| POST | `/api/user/add` | [src/api/user-api.js:32](D:/MailServer/cloud-mail/mail-worker/src/api/user-api.js:32) |
| PUT | `/api/user/resetSendCount` | [src/api/user-api.js:37](D:/MailServer/cloud-mail/mail-worker/src/api/user-api.js:37) |
| PUT | `/api/user/restore` | [src/api/user-api.js:42](D:/MailServer/cloud-mail/mail-worker/src/api/user-api.js:42) |
| GET | `/api/user/allAccount` | [src/api/user-api.js:47](D:/MailServer/cloud-mail/mail-worker/src/api/user-api.js:47) |
| DELETE | `/api/user/deleteAccount` | [src/api/user-api.js:52](D:/MailServer/cloud-mail/mail-worker/src/api/user-api.js:52) |

## 附录 B：本地审计证据

以下文件在被忽略目录，不作为项目测试套件或生产代码提交；清理.wrangler后可能消失。关键信息已固化在本报告。

- [源码规模、函数长度、65路由与循环依赖](D:/MailServer/cloud-mail/mail-worker/.wrangler/audit-evidence/metrics.json)
- [临时严格checkJs诊断概况](D:/MailServer/cloud-mail/mail-worker/.wrangler/audit-evidence/checkjs-scout.json)
- [内存数据库升级、schema差异、设置/语言/引用实验](D:/MailServer/cloud-mail/mail-worker/.wrangler/audit-evidence/db-state.md)
- [邮件、附件、模板与对象存储实验](D:/MailServer/cloud-mail/mail-worker/.wrangler/audit-evidence/mail-storage.md)
- [dev配置生成的runtime/Env类型](D:/MailServer/cloud-mail/mail-worker/.wrangler/audit-evidence/worker-env.d.ts)


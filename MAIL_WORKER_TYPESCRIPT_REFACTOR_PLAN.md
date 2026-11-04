# mail-worker TypeScript Migration & Refactoring Plan

> 基线：2026-10-03，Git HEAD b4b0b421a07673dc96b8da935211f895dfb35fcb。依据 [上一阶段审计](D:/MailServer/cloud-mail/MAIL_WORKER_TYPESCRIPT_AUDIT.md) 和本轮工具链/依赖复核。本文件是执行方案，尚未修改业务代码、工程配置、依赖或部署。
>
> 核心决定：先建立可比较的行为基线，原位逐批类型化，再做有测试支撑的职责提取。保留 api / service / entity / dao 等已有边界；不新增 Controller，不全量 Repository 化，不切换 Wrangler 配置格式，不升级 Cloudflare compatibility date。

## 1. 执行范围与不可变约束

本次迁移的生产产物仍是同一个 Cloudflare Worker，仍负责 HTTP API、SPA/assets、邮件事件和 scheduled 维护。TypeScript 只参与静态检查，Wrangler 打包源码；不增加一个运行时 TS 编译层。

每个工作包必须单独记录：转换/提取的文件、对外行为差异是否为零、关联契约测试、构建结果和回滚提交。默认一次处理 2–5 个小文件；email-service、init、security 等复杂模块按方法群拆批。一个阶段可以包含多个可独立提交、验证、回滚的工作包。

冻结以下内容：

| 边界 | 保持内容 |
| --- | --- |
| HTTP | 审计附录 A 的 65 个 method/path；外层 /api 前缀；Query/Path/Body 来源与字段；各自分页、默认值及大小写 |
| 响应 | HTTP status、JSON 字段/缺省/省略规则、文本/HTML/流响应、Cache-Control/Content-Type/Content-Disposition、CORS/OPTIONS；不把所有接口统一成新 envelope |
| 登录 | 原始 Authorization，无 Bearer 前缀；不新增 Cookie；普通登录 JWT、HS256、KV 会话/TTL/key；public、OAuth setup、Telegram token 保持各自语义 |
| OAuth | linuxDo API / linuxdo provider / linuxdo callback 的不同拼写；三个专用 callback URI；setupToken purpose/900 秒有效期；绑定/登录顺序及前端状态 |
| 持久化 | 12 张表的 DDL/索引/列名/默认值/NULL、实际 SQL 和参数、JSON/CSV 格式；rege_key_id 等既有拼写 |
| 存储 | auth-uid:、setting:、send_day_count:、analysis_echarts:、public_key:；attachments/ 内容哈希 key、static/background、legacy 附件 URL、正文 {{domain}} |
| 配置 | db / kv / assets / r2 / ai / email 名称；现有变量名称；S3→R2→KV 与 Cloudflare email→Resend 优先级；配置读取时点 |
| 生命周期 | 副作用/初始化顺序；HTTP 请求缓存与事件上下文差异；scheduled 串行执行与首个失败传播；邮件副作用与 catch/降级边界 |

已确认 bug 可以另开小型修复包，但不得隐藏在改后缀、类型断言或目录搬迁中。审计 F05/F10 的缺 await、F13 的发件后置校验、F14 的 raw 解码、F20 的附件 MIME、F22 的 init、F25 的并发语言等均使用独立问题、目标测试和提交。类型迁移遇到这些阻断时，暂留对应 JS 方法/文件并标注退出条件；不伪造返回类型，也不把所有安全/一致性修复塞进本次第一阶段。

## 2. 推荐最终结构

以下是迁移收尾时的目标，不在 Phase 1 一次创建。文件只有在承接现有职责时才落地；同名 .js/.ts 不并存。

~~~text
mail-worker/
├─ package.json
├─ pnpm-lock.yaml
├─ tsconfig.json
├─ eslint.config.mjs
├─ worker-runtime.d.ts                 # Wrangler 生成，只含 runtime
├─ wrangler.toml                      # 保留四份 TOML
├─ wrangler-dev.toml
├─ wrangler-test.toml
├─ wrangler-action.toml
├─ scripts/
│  ├─ prepare-build-deploy.mjs
│  ├─ prepare-build-deploy.test.mjs
│  ├─ attachment-routing.test.mjs
│  ├─ oauth-setup.test.mjs
│  └─ test-module-loader.mjs           # 编译真实 JS/TS；不 regex 剥业务源码
├─ test/
│  ├─ fixtures/                       # 脱敏 HTTP/MIME/DDL/KV/provider 基线
│  ├─ unit/                           # codecs、JWT、SQL/参数等
│  ├─ contracts/                      # Node test + Miniflare 4，真实 bundle
│  └─ helpers/                        # fixture seed、出站隔离、事件注入、比较器
└─ src/
   ├─ index.ts                        # fetch/email/scheduled；薄入口
   ├─ hono/
   │  ├─ app.ts                       # createApp，按既有顺序组合
   │  └─ routes.ts                    # 显式 endpoint 注册，不额外加 URL 前缀
   ├─ api/
   │  └─ 现有 17 个非空 *-api.ts      # 读取 HTTP、调用 service、返回原响应
   ├─ security/
   │  ├─ security.ts                  # 认证/权限 middleware，显式注册
   │  ├─ auth-policy.ts               # 既有排除/权限清单，保持 startsWith 语义
   │  └─ user-context.ts
   ├─ service/
   │  ├─ account-service.ts
   │  ├─ analysis-service.ts
   │  ├─ att-service.ts
   │  ├─ email-service.ts             # 保留公共 facade；拆出复杂工作流
   │  ├─ login-service.ts
   │  ├─ oauth-service.ts
   │  ├─ perm-service.ts
   │  ├─ public-service.ts
   │  ├─ r2-service.ts                # 兼容名称；对象后端选择/业务调用边界
   │  ├─ reg-key-service.ts
   │  ├─ resend-service.ts            # 入站回调的业务状态处理
   │  ├─ role-service.ts
   │  ├─ setting-service.ts
   │  ├─ settings-reader.ts           # 原 query/cache 行为；不导入存储业务
   │  ├─ star-service.ts
   │  ├─ telegram-service.ts          # 展示/查看 token/推送业务
   │  ├─ user-service.ts
   │  └─ verify-record-service.ts
   ├─ dao/
   │  ├─ analysis-dao.ts              # 保留既有统计 SQL
   │  └─ email-dao.ts                 # 只提取复杂/重复查询；不包装所有表
   ├─ entity/
   │  ├─ orm.ts
   │  └─ 现有 12 个表映射 .ts         # 保留运行时 builder/default/mode
   ├─ email/
   │  ├─ receive.ts                   # ForwardableEmailMessage 接收编排
   │  ├─ send.ts                      # 原 send 编排
   │  ├─ onsite-delivery.ts           # 原 HandleOnSiteEmail
   │  ├─ attachments.ts               # provider/bytes/base64 转换
   │  ├─ content.ts                   # 原 imgReplace/CID 内容转换
   │  └─ maintenance.ts               # 原接收恢复/自动清理编排
   ├─ integrations/
   │  ├─ storage/
   │  │  ├─ kv.ts                     # 既有对象 key/metadata/HTTP 兼容
   │  │  ├─ r2.ts
   │  │  └─ s3.ts
   │  ├─ email/
   │  │  ├─ cloudflare.ts
   │  │  └─ resend.ts
   │  ├─ oauth/
   │  │  ├─ google.ts
   │  │  ├─ github.ts
   │  │  └─ linuxdo.ts
   │  ├─ ai.ts
   │  ├─ turnstile.ts
   │  ├─ telegram.ts
   │  └─ webhook.ts
   ├─ types/
   │  ├─ env.ts
   │  ├─ context.ts                   # HTTP/EnvOnly/cache/metadata 能力
   │  ├─ auth.ts                      # claims、KV session、当前用户
   │  ├─ settings.ts                  # D1 raw/KV/cache/public/admin 分离
   │  ├─ mail.ts                      # DB raw、列表/发送/接收 DTO 分离
   │  ├─ attachment.ts
   │  ├─ api.ts                       # legacy envelope/公共 HTTP 类型
   │  └─ admin.ts                     # account/user/role/reg-key 请求与响应
   ├─ error/
   │  ├─ biz-error.ts
   │  └─ http-error-handler.ts         # 原 onError 的兼容映射
   ├─ model/result.ts                 # 原响应构造器
   ├─ const/{constant,entity-const,kv-const}.ts
   ├─ lib/email-list-columns.ts
   ├─ init/init.ts                    # 原建表/升级链，独立保守迁移
   ├─ i18n/{i18n,zh,en}.ts
   ├─ template/{email-html,email-msg,email-text}.ts
   └─ utils/                          # 保留现有文件名；无状态小工具
~~~ 

### 各目录边界

- api 已承担 Controller 职责，不新增 controllers。也不强制让每个路由拥有独立 handler/service/repository 三件套。
- hono 管组合，api 管 endpoint；security 管既有认证政策。没有单独 middleware 空目录，middleware 留在所属模块。
- service 组织业务，不依赖 Hono 响应方法。第一轮允许使用窄结构上下文兼容旧签名；最终新提取工作流通过明确参数/能力调用，不接受万能 Context。
- dao 负责值得抽离的查询，不持有第三方客户端、不发送邮件、不构造 HTTP response。简单 service 查询可保留，避免制造一行转发层。
- entity 描述现有映射，init 是历史 DDL 执行链；两个事实不得混为自动 schema 同步。
- email 按本项目复杂业务拆分，integrations 处理供应商协议和对象读写。供应商适配器接收已取得的配置/参数，不反向 import service 查配置或当前用户。
- settings-reader 从原 setting.query 原样提取，可被 setting/r2/S3 使用，切断 setting↔storage 循环；保留缓存命中、对象 mutation 和 KV 读取次数，不顺手改为全事件快照。
- types 只存共享协议，使用 import type；局部类型留模块附近。它不导入 app/service，避免用类型目录重新构建循环。
- email-service 与 att-service facade 只有在保护现有调用关系时保留。提取模块不再反向 import facade；通过少量具名函数参数提供需要的查询/持久化能力，不引入 DI 容器或通用 BaseService。
- i18n 显式注册只消除 import-app 环，不自动修复全局语言并发问题；request translator 改造属于已确认 bug 的独立工作包。
- Node 工具/测试继续 .mjs；业务 src 最终全部 TS。不因后端迁移把前端或构建脚本全部转 TS。

## 3. 原文件 → 新文件/模块映射

所有路径均相对 mail-worker/src；“原位”表示先仅改后缀、补类型，职责提取另一个提交完成。Phase 编号见第 7 节。

### API 与装配（覆盖全部 18 个 API 文件）

| 原文件 | 首次迁移 / 最终位置 | 阶段与注意事项 |
| --- | --- | --- |
| api/account-api.js | api/account-api.ts | P6 原位类型化；P8 才启用 registerAccountRoutes(app)，URL 不变 |
| api/all-email-api.js | api/all-email-api.ts | P6；全站查询/删除响应保留 |
| api/analysis-api.js | api/analysis-api.ts | P6；timeZone 参数仍由原位置读取 |
| api/email-api.js | api/email-api.ts | P6；send/read/list/latest 等契约 |
| api/init-api.js | api/init-api.ts | P6 原位；P8 显式注册；文本响应与 secret 路径不变 |
| api/login-api.js | api/login-api.ts | P6；注册、登录、退出各自返回值 |
| api/my-api.js | api/my-api.ts | P6；当前用户/密码/设置，不合并进 user API |
| api/oauth-api.js | api/oauth-api.ts | P6；三家登录与 bindUser |
| api/public-api.js | api/public-api.ts | P6；public key 验证与跨用户接口 |
| api/r2-api.js | api/r2-api.ts | P6；/oss/* 的当前对象响应，不顺手修 404/metadata |
| api/reg-key-api.js | api/reg-key-api.ts | P6 |
| api/resend-api.js | api/resend-api.ts | P6；/webhooks 自行 catch，文本 200/500 |
| api/role-api.js | api/role-api.ts | P6 |
| api/setting-api.js | api/setting-api.ts | P6；公开/管理配置不是同一 DTO |
| api/star-api.js | api/star-api.ts | P6；星标列表与邮箱列表区别保留 |
| api/telegram-api.js | api/telegram-api.ts | P6；HTML/缓存行为 |
| api/user-api.js | api/user-api.ts | P6；管理员列表/创建/状态/删除/恢复 |
| api/test-api.js | 不创建 TS 替代 | P8 删除已确认的空文件及 import |
| hono/hono.js | 原位 hono/hono.ts → hono/app.ts + error/http-error-handler.ts | P6 类型化单例；P8 协调显式组装 |
| hono/webs.js | 原位 hono/webs.ts → hono/routes.ts + app.ts 的导出入口 | P6 保持副作用；P8 显式注册全部 17 模块 |
| security/security.js | security/security.ts + security/auth-policy.ts | P6 原位类型化；P8 提取清单并切注册机制，不改权限策略 |
| security/user-context.js | security/user-context.ts | P5 认证批；明确 Promise/已认证前置条件 |
| index.js | index.ts | P7；三个 handler；必须同步所有配置生成/测试引用 |

### Service（覆盖全部 22 个原文件）

| 原文件 | 首次迁移 / 提取目标 | 阶段 |
| --- | --- | --- |
| service/account-service.js | 原位 account-service.ts | P5D，依赖设置/角色/验证/用户 |
| service/ai-service.js | 原位 → integrations/ai.ts | P5C；传 env 与既有 options，不查设置/用户 |
| service/analysis-service.js | 原位 analysis-service.ts | P5A；使用已迁 analysis-dao |
| service/att-service.js | 原位 att-service.ts；转换移入 email/attachments.ts | P5E；持久化/引用/删除留业务边界 |
| service/email-service.js | 分批提取再完成 email-service.ts facade | P5E/F；具体方法群见下表 |
| service/kv-obj-service.js | 原位 → integrations/storage/kv.ts | P5A；过渡 wrapper 保持入口/测试能调用 |
| service/login-service.js | 原位 login-service.ts | P5D；登录/注册编排保持 |
| service/oauth-service.js | 原位 oauth-service.ts + integrations/oauth/{google,github,linuxdo}.ts | P5D；远端协议与业务绑定分开 |
| service/perm-service.js | 原位 perm-service.ts | P5B；较小查询服务 |
| service/public-service.js | 原位 public-service.ts | P5D 后段；不要顺手改 public 查询范围/SQL |
| service/r2-service.js | 原位 r2-service.ts + integrations/storage/r2.ts | P5B；保留供应商选择 facade 与名称 |
| service/reg-key-service.js | 原位 reg-key-service.ts | P5B；角色依赖、额度/过期值 |
| service/resend-service.js | 原位 resend-service.ts | P5F；回调解析/状态更新，发送 SDK 另处 |
| service/role-service.js | 原位 role-service.ts | P5B；CSV/数组、默认角色/权限 |
| service/s3-service.js | 原位 → integrations/storage/s3.ts | P5B；接收已读 S3 配置 |
| service/setting-service.js | 原位 setting-service.ts + settings-reader.ts | P5B；兼容 raw/KV/cache/遮罩状态 |
| service/star-service.js | 原位 star-service.ts | P5E 查询稳定后；查询/删除顺序 |
| service/telegram-service.js | 原位 telegram-service.ts + integrations/telegram.ts | P5C；token/模板业务保留 |
| service/turnstile-service.js | 原位 → integrations/turnstile.ts | P5C/D；verify 参数由原调用方在原时点取得 |
| service/user-service.js | 原位 user-service.ts | P5D；列表/当前用户/缓存不是同一类型 |
| service/verify-record-service.js | 原位 verify-record-service.ts | P5B；HTTP IP 与 env-only 清理分开 |
| service/webhook-service.js | 原位 → integrations/webhook.ts | P5C；原 payload/auth/retry/catch 顺序 |

email-service 的结构提取工作包：

| 当前方法/区域 | 目标 | 保持的边界 |
| --- | --- | --- |
| list/allList/latest/allEmailLatest/过滤与游标 SQL/selectById/count/status update | dao/email-dao.ts + facade 的 DTO/附件拼装 | 先搬查询/参数，不混进 listText/attList/HTTP；完整与摘要投影保留 |
| toCloudflareAttachments/toResendAttachments/toArrayBufferAttachments/toAttachmentBase64/toAttachmentArrayBuffer | email/attachments.ts | 字段 fallback、数组顺序、bytes/base64/CID 不变 |
| imgReplace | email/content.ts | 现有 DOM mutation/占位/URL，不同时修 CID 引用 |
| sendByCloudflareEmail/sendByResend | integrations/email/{cloudflare,resend}.ts | 原供应商 payload/header/error 与调用次数 |
| HandleOnSiteEmail | email/onsite-delivery.ts | 原 all-internal 分支、副本/状态/附件规则 |
| send | email/send.ts | 仍按原副作用顺序；不重新排序校验/发件/计数/持久化 |
| completeReceiveAll/autoClean/batchDelete 编排 | email/maintenance.ts | cron 顺序、批次/循环、软删及对象清理语义 |
| receive/completeReceive/read/delete/physicsDelete 等 facade 方法 | 先留 service/email-service.ts | 不要求一次搬完；重复持久化以后有证据再提取 |

### 数据层与其他源码（覆盖剩余原文件）

| 原文件 | 新位置 | 阶段 |
| --- | --- | --- |
| entity/account.js、att.js、email.js、oauth.js、perm.js、reg-key.js | 同名 entity/*.ts | P4 分批；表名/列/DDL/default/mode 不变 |
| entity/role.js、role-perm.js、setting.js、star.js、user.js、verify-record.js | 同名 entity/*.ts | P4 分批；setting 原消费脚本一起适配 |
| entity/orm.js | entity/orm.ts | P4；每次创建 Drizzle，不改全局 singleton |
| dao/analysis-dao.js | dao/analysis-dao.ts | P4；显式聚合 Row、真实 SQL/params |
| lib/email-list-columns.js | lib/email-list-columns.ts | P4 邮件 schema 后；summary SQL 长度/NULL 处理 |
| email/email.js | email/receive.ts | P7；P5F 可先提取纯准备函数，事件入口最后切 |
| init/init.js | init/init.ts | P8 独立批；历史 SQL/执行次序/异常吞吐保持 |
| error/biz-error.js、model/result.js | 同名 .ts | P3；默认 code/falsy 语义 |
| const/constant.js、kv-const.js、entity-const.js | 同名 .ts | P3；字面量 union，0/1 不统一成 boolean |
| utils/crypto-utils.js、file-utils.js、email-utils.js | 同名 .ts | P3；WebCrypto/bytes/DOM 类型 |
| utils/domain-uitls.js、date-uitil.js、time-utils.js、verify-utils.js | 同名 .ts | P3；保留拼写/日期插件初始化 |
| utils/jwt-utils.js | utils/jwt-utils.ts | P3 后段；generic verify 的解析结果先 unknown |
| utils/req-utils.js | utils/req-utils.ts | P3 后段；只要求 request header 能力 |
| template/email-html.js、email-msg.js、email-text.js | 同名 .ts | P3 数据输入类型/P5C 联调；不顺手改 sanitizer/内容 |
| i18n/zh.js、en.js | 同名 .ts | P3；i18n.js 中显式 .js import 在同一提交改相对无后缀 |
| i18n/i18n.js | i18n/i18n.ts | P6；P8 拆显式注册，不同时替换全局 translator |

业务之外必须同步的消费者：

| 文件 | 必须处理 |
| --- | --- |
| scripts/attachment-routing.test.mjs | 当前硬读 index.js/kv-obj-service.js 并 regex 改源码；P0 支持真实 JS/TS 编译、P5/P7 更新模块定位 |
| scripts/oauth-setup.test.mjs | 当前硬读 jwt-utils.js/oauth-service.js；P0 loader 适配，保留 17 个 Worker 基线测试的断言 |
| scripts/prepare-build-deploy.mjs / .test.mjs | P7 将生成配置 main 同步为 src/index.ts；assert main；保留绑定恢复、分支限制/vars/资源 ID |
| mail-react/scripts/compat-audit.mjs | P0 改为 JS/TS 路径解析 + TS AST；它当前按精确函数字符串截取 websiteConfig，后缀替换不足。只改维护工具，前端业务不变 |
| 四份 wrangler*.toml | P7 仅改 main；本方案不改 date/flags/cron/name/assets/bindings/vars/格式 |
| .github/workflows | P0 增加验证关卡；生产初始化风险见第 8 节。不在类型提交里自动改变部署资源/业务初始化 |
| AGENTS.md | 对实际落地的路径/脚本/边界更新；不把目标树提前写成现状 |
| vitest.config.js / test/index.spec.js | P0 不作为基线；P8 在新测试覆盖完成后移除不可运行的旧模板及无用依赖 |

## 4. TypeScript 工程方案

### 4.1 锁定当前能力

已安装并核实：Wrangler 4.90.0、其 Miniflare 4.20260507.1/workerd 1.20260507.1；Hono 4.12.16、Drizzle 0.42.0、PostalMime 2.4.4、Resend 6.4.1。Worker 当前没有直接 TypeScript/ESLint 依赖，前端有 TypeScript 5.9.3。

P1 将 Wrangler 的开发依赖约束由 ^4.90.0 固定为当前 4.90.0，保留现有业务依赖的 lockfile resolved 版本。新增测试/类型依赖时审查锁文件差异，不接受解算器顺带升级 SDK/Hono/Drizzle；真正升级工具链另开工作包。

新增本包 devDependencies：

- typescript 5.9.3；不长期借前端 tsc。
- eslint / @eslint/js 9.39.5、typescript-eslint 8.70.1，复用本轮核实的前端已安装版本，Phase 1 在隔离提交安装/验证并锁入 Worker lockfile；不复制前端关闭 any 的规则。
- esbuild 0.27.3、miniflare 4.20260507.1，作为测试直接依赖，匹配当前 Wrangler 打包/Worker runtime。
- 不同时安装 @cloudflare/workers-types 与 Wrangler runtime 声明。
- 不为本次迁移启用 nodejs_compat 或改变 compatibility_date。

旧 pool-workers 0.7.8 自带 Wrangler 3.114.1/Miniflare 3；vitest.config 引用不存在的 wrangler.jsonc，测试还是 Hello World。仅修路径不能证明测试 runtime 与部署匹配。本方案沿用已验证的 Node 24 node:test，并用直接 Miniflare 4 执行真实 bundle。旧模板不是必须修到可跑的资产；P8 覆盖替换后删除。最新 Cloudflare 文档已改名 Vitest plugin，本次不为了测试框架升级再引入 Vitest major migration。

### 4.2 Runtime 类型生成

建议脚本：

~~~json
{
  "types": "wrangler types worker-runtime.d.ts --config wrangler-dev.toml --include-env=false --include-runtime=true",
  "types:check": "wrangler types worker-runtime.d.ts --config wrangler-dev.toml --include-env=false --include-runtime=true --check"
}
~~~

runtime-only 的理由：dev 配置没有 ai/r2/email，vars 当前会被生成为假 secret 和具体域名数组的字面量；default 配置又缺 db/kv。不能把任一配置生成的 Env 直接当完整生产协议。保留 Wrangler 对 date/flags 的生成结果，另外在 src/types/env.ts 建立真实 Env。

worker-runtime.d.ts 可提交并由 types:check 检查；不手改，不生成到 dist，不 lint 供应商声明。compatibility/date/flags 真正改变时才重新评审 runtime 差异。四份配置的 date/flags 保持一致，Phase 0 配置检查覆盖这一点。[官方类型生成说明](https://developers.cloudflare.com/workers/languages/typescript/)

本轮已在被忽略的 .wrangler/audit-evidence 运行 runtime-only 生成，并以 TypeScript 5.9.3 验证新 TS + 82 个原 JS 的共存配置、Hono generics、三个 ExportedHandler 方法及 SendEmail builder：0 诊断。它证明工程组合可行，不代表业务全量类型化已完成。

### 4.3 初始 tsconfig.json

~~~json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["./worker-runtime.d.ts"],
    "allowJs": true,
    "checkJs": false,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts", "src/**/*.js", "worker-runtime.d.ts"],
  "exclude": ["node_modules", "dist", ".wrangler", "test", "scripts"]
}
~~~

- strict 从第一份业务 TS 生效；旧 JS 的逃生阀是 checkJs:false，不是让新 TS 全部宽松。
- 不在第一阶段启用 noUncheckedIndexedAccess/exactOptionalPropertyTypes/noUnusedLocals；这些可选加严有独立成本，不是合理 strict 的前提。
- skipLibCheck 只跳依赖/generated .d.ts 内部检查；业务 .ts 必须 0 诊断。记录第三方 typing 不足，不复制一个 declare module '*':any。
- 不加 DOM lib；Request/Response/File/Streams 等使用 Worker runtime 类型。Node 工具独立 .mjs/测试执行环境，不给业务 src 添加 Node globals。
- 不启用 declaration/outDir，也不输出镜像 JS。Wrangler/esbuild 直接打包混合源码。
- P8 将 allowJs:false，include 改为 src/**/*.ts + runtime 声明；strict 继续 true。不允许用排除某个 src 文件让最终检查“通过”。
- 相对 import 延续无后缀，类型使用 import type。不要提前把所有 import 改成 .js，也不必给 package 添加 type:module（现有 Node 工具已是 .mjs）。

### 4.4 Env、Context 和数据类型

Env 表达代码实际允许的部署状态，和“正常生产必须配置什么”分开：

~~~ts
export interface WorkerEnv {
  assets: Fetcher;
  db?: D1Database;
  kv?: KVNamespace;
  r2?: R2Bucket;
  ai?: Ai;
  email?: SendEmail;

  domain?: string[] | string;
  admin?: string;
  jwt_secret?: string;
  orm_log?: boolean;
  analysis_cache?: boolean | string;
  ai_model?: string;
  project_link?: boolean | string;
}
~~~

db/kv/关键 vars 标可选，是因为仓库 default 模板确实允许缺失并存在错误映射，不表示完整邮箱功能可以缺它们。正常生产能力类型可用 Required<Pick<WorkerEnv, 'db' | 'kv' | 'domain' | 'admin' | 'jwt_secret'>> 与 WorkerEnv 组合；只有能力被证实时才获得它。orm/业务路径的收窄发生在原首次访问点，保持现有缺绑定错误 envelope；不在模块加载或所有 fetch 开头加 fail-fast，以免改变 assets/公开接口可用性。orm_log 若未来发现 dashboard string 形态，再根据真实样本扩大，不擅自把 'false' 归一化。

~~~ts
export type EnvContext = { env: WorkerEnv };
export type AppVariables = {
  user: SessionUser | undefined;
  setting: SettingsCache | undefined;
};
export type AppEnvironment = {
  Bindings: WorkerEnv;
  Variables: AppVariables;
};
export type HttpContext = Context<AppEnvironment>;
~~~

实际 context.ts 再分出 ConfigReadContext（可选 setting get/set）、ConfigWriteContext（refresh 必须 set）、RequestMetadataContext（req.header）、AuthenticatedContext 的能力。不要制造假的 req/get/set 给 email/cron，也不要把 {env} 断言成 Hono Context。Hono Context Variables 的请求生命周期与泛型由 [Hono 官方文档](https://hono.dev/docs/api/context) 支持。

Cloudflare 类型直接覆盖 D1Database/KVNamespace/R2Bucket/Ai/SendEmail/ForwardableEmailMessage/ScheduledController/ExecutionContext/ExportedHandler。入口最终用 satisfies ExportedHandler<WorkerEnv>；保留 email handler，不改类式 Worker。

数据库与 DTO 至少分开：

| 类型 | 内容与约束 |
| --- | --- |
| DB raw rows / inserts | $inferSelect/$inferInsert 起点，加历史字段的保守 union；JSON/CSV 仍是存储格式 |
| KV session | tokens、缓存用户、TTL/key 规则；不假设是登录响应 |
| JWT decoded | generic verify 返回 unknown/null；用途消费者才判定普通会话/OAuth setup/Telegram claims |
| SettingsRaw / StoredSettings / SettingsCache | JSON resendTokens、string/array emailPrefixFilter、是否 domainList、遮罩 mutation 等实际差异 |
| WebsiteConfig / AdminSettingsResponse | 明确当前返回字段；不把所有 secret/filter 统一处理 |
| MailBrief / MailFull / SendRequest / ReceivedMail | 摘要/full、recipient JSON 解码、attList、输入数组分别建模 |
| UploadAttachment / ParsedAttachment / PreparedAttachment / StoredAttachment | contentType/mimeType/type 的差异、filename null、bytes/base64/CID，禁止一个万能 Attachment |
| LegacySuccess<T> / LegacyFailure | 成功有 data，失败无 data；result.ok 保持 falsy→null，不换 ?? 语义 |
| Provider payload/receipt | SDK 类型与 unknown response 收窄；accepted receipt 不等于 delivered 业务状态 |

### 4.5 JS/TS 共存与安全桥接

1. 先在原路径转换叶子，旧 JS 可以直接 import TS，Wrangler 负责解析。一个 basename 只保留一份实现。
2. 循环依赖暂时存在时，以 types-only 共享协议、具名能力参数和 facade 过渡，不一次转换整个 Service SCC。
3. 新 TS 消费旧 JS 的不可靠返回值时，边界返回 unknown，再按已经使用的字段/分支收窄；为小接口做契约测试。不能用 .d.ts 覆盖 JS 隐藏实现检查，也不能把整个旧 service 断言成已正确的类型。
4. 大文件可先把可检查方法提取到 TS，旧 JS facade 继续转发；最后余下方法迁完才删除 JS。不要同时维护 JS/TS 两套业务逻辑。
5. 本项目对象方法使用 this；提取时明确绑定/传入依赖，不直接解构方法导致 this 丢失。
6. 第三方 JSON、KV JSON、AI 输出、webhook body 用 unknown + narrowing。c.req.json<Dto>()、D1 .all<Dto>() 不是运行时验证。
7. API 参数收窄复用原有校验、默认/转换和错误位置；新拒绝规则、字段白名单、自动数值化、默认 fallback 会改变行为，另开明确 bug/契约变更包。遇到无法安全表达的 legacy 方法先暂留 JS，不用类型伪装兼容。
8. 不使用 as any、@ts-ignore、@ts-nocheck；不让迁移后的业务 any 长期存在。只在真正的 type-level 负例测试使用 @ts-expect-error，并断言它仍能捕获错误。

### 4.6 Lint、scripts、build 与 deploy

ESLint flat config 使用 typescript-eslint 推荐 TS 规则；只 lint 已迁 src/**/*.ts，忽略 generated runtime/.wrangler/dist。至少启用 no-explicit-any、ban-ts-comment（禁止 ignore/nocheck）、consistent-type-imports。type-aware no-unsafe-* / no-floating-promises 从已无 JS 返回污染的模块分批打开，P8 覆盖全部业务；检查不能靠补 void 隐藏原缺 await bug。无格式化全仓库要求。

推荐脚本（P0/P1 增量落地，不提前运行未创建目录的命令）：

~~~json
{
  "types": "wrangler types worker-runtime.d.ts --config wrangler-dev.toml --include-env=false --include-runtime=true",
  "types:check": "wrangler types worker-runtime.d.ts --config wrangler-dev.toml --include-env=false --include-runtime=true --check",
  "typecheck": "tsc -p tsconfig.json",
  "lint": "eslint \"src/**/*.ts\" --max-warnings=0 --no-error-on-unmatched-pattern",
  "test:node": "node --test scripts/attachment-routing.test.mjs scripts/oauth-setup.test.mjs scripts/prepare-build-deploy.test.mjs \"test/unit/**/*.test.mjs\"",
  "test:worker": "pnpm run build:worker && node --test --test-concurrency=1 \"test/contracts/**/*.test.mjs\"",
  "test": "pnpm run test:node && pnpm run test:worker",
  "build:assets": "pnpm -C ../mail-react run build",
  "build:worker": "wrangler deploy --dry-run --config wrangler-dev.toml --outdir .wrangler/ts-build",
  "build": "pnpm run types:check && pnpm run typecheck && pnpm run build:assets && pnpm run build:worker",
  "verify": "pnpm run types:check && pnpm run typecheck && pnpm run lint && pnpm test",
  "dev": "wrangler dev --local --config wrangler-dev.toml",
  "start": "wrangler dev",
  "deploy": "pnpm run verify && wrangler deploy",
  "deploy:test": "pnpm run verify && wrangler deploy --config wrangler-test.toml"
}
~~~

test 原来会部署，P0 单独改为真正测试并将原能力显式命名 deploy:test；不要在改脚本前执行 pnpm test。保留 package private/version；新增依赖后更新本包 lockfile，后续使用 frozen-lockfile。

build:worker 是本地打包验证，不是 tsc emit，也不替代前端 assets 构建。verify 前必须已有本次前端构建/测试 fixture assets；CI 顺序为 install → types:check → typecheck/lint/unit → frontend build → Worker contracts → 目标配置 dry-run。不让 Worker build hook 再调用 Worker build 形成递归。

上表 deploy 保留原用途并加验证门槛，但默认 TOML 仍是缺绑定模板。真实发布只能针对经检查、含原资源绑定的解析配置；不把 pnpm deploy 或示例 wrangler-test 当可安全上线的默认命令。dev 不使用 --remote。不把 deploy 放进测试。

## 5. 数据库迁移的特殊规则

本阶段没有数据库迁移：不加表、不改列、不改索引、不引入 drizzle-kit generate/push/migrate、不自动修历史默认值。

Drizzle builder 本身也是行为，必须冻结。已用当前 Drizzle 在本地比较：

- setting.send/syncDelete 的 default(1) 换 0，即使 INSERT SQL 文本没变，参数会变。
- text(..., {mode:'json'}) 即使仍是 TEXT 列，也会改变结果解码；现有 JSON.parse 会失败。
- $type() 在 Drizzle 0.42.0 返回同一 builder，不改变 SQL/default/mapper；适合先表达现有错配，但不会把历史 string '5' 转为 number。

可采用保守纯类型桥接：

~~~ts
text('sort').$type<number | string>().default(0)
text('send_count').$type<number | string>().default(0)
text('status').$type<number | string>().default(0).notNull()
// verify_record.ip / oauth.platform 依现有 builder 使用 $type 的历史 union。
~~~

不要顺手加 notNull、改变 text/integer/default、使用 Date/boolean/JSON mode。union 以真实 fixture 数据确定；未核实生产历史值前不要只宣称 number 或三家 provider literal。业务边界保留已存在的比较/转换，DTO 归一化另审。

每个 schema 批比较：sqlite_master/PRAGMA 基线，Drizzle 生成的代表性 SELECT/INSERT/UPDATE SQL 与 params，以及真实本地 D1 查询结果/JSON。Raw SQL .first/.all 泛型和 sql<T> 不验证数据，聚合结果使用明确 Row + 必要收窄。

init 最后迁移。它 747 行、多版本顺序和 catch 具有数据副作用；不因为改 TS 增加版本表/修复全链幂等性。用同一份历史 SQL 在独立本地 fixture 执行 fresh、重复、partial upgrade；比较 DDL、数据、警告和失败结果，记录已知缺陷。绝不拿生产 D1 验证重复 init。

## 6. 最小回归基线与测试机制

### 测试路线

- 保留已有 17 个 Worker + 17 个 React Node 测试；适配 loader 之后断言数量/目的不能减少。
- 新 test-module-loader 用 esbuild 编译真实模块，JS/TS 自动解析；测试替身只在明确依赖入口隔离，不 regex 删除 import、重写业务函数或添加测试生产路由。
- Worker contracts 使用 build:worker 输出 + Miniflare 4 原生 D1/KV/R2，fixture 每例独立，不连接远程 binding。获取数据库/存储采用 public getD1Database/getKVNamespace/getR2Bucket。
- scheduled 通过 getWorker().scheduled({cron,scheduledTime})；email 使用锁定 Miniflare 的 unsafeTriggerHandlers:true 与 POST /cdn-cgi/handler/email?from=...&to=... 注入真实 raw MIME。该 email 测试入口是模拟器能力，不加入生产路由，也不使用不存在的 dispatchEmail API。
- 本轮已实测真实 bundle 的邮件入库、scheduled、原生 email.send builder 的允许/拒绝收件人及 [1,2,3] 附件字节。模拟器的关闭收件触发端点仍返回 HTTP200，因此 SMTP 拒绝另用真实编译 handler + recording message.setReject fixture 验证；本地成功不证明真实投递/SMTP全行为。
- outboundService/fetchMock 阻断网络，提供捕获实际 payload 的 OAuth/Resend/Turnstile/TG/webhook fixture；native email binding 使用本地 binding/受约束替身验证 send payload 和失败，而不是全局 fetch mock 假装覆盖。
- assets 主链仍需真实 Wrangler 本地 smoke，核对 SPA/PWA 与附件缺失行为；Miniflare 测试替身不能替代真实 assets 设置。
- golden 比较允许固定 clock/random 和替换合法动态 ID/token/time；必须另断言 JWT claims/签名、key 派生、行关系、日志/副作用顺序，不能把这些字段统统忽略。
- 同一输入跑基线 JS bundle 与候选混合/TS bundle，比较 HTTP 和 D1/KV/对象/provider 轨迹。fixture/比较器修改不得与业务修改一起自动重录基线。

### 最低必测契约

| 契约组 | 用例与观察点 |
| --- | --- |
| 路由/装配 | 65 个唯一 method/path；CORS→i18n→security→routes；副作用仅一次；未知 API；OPTIONS 204；错误 HTTP200/payload401/403/501/500 |
| 静态/对象 | /api prefix、assets SPA、static、attachments、mail/attachments；GET/HEAD、缺失404、unsupported method、metadata/cache；/api/oss 原特殊行为 |
| envelope/错误 | result.ok(undefined/null/false/0/'')；fail 不带 data；BizError code 默认/0；invalid JSON；缺 db/kv；D1 缺列；webhook 文本200/500 |
| 会话 | 正常/错误密码、禁用/软删用户、管理员合成角色；原始Authorization、无Cookie；KV key/tokens/TTL/刷新；public key；logout 记录已知缺 await 而不伪装“撤销已成功” |
| OAuth | 三家已有绑定/未绑定；provider payload；开关；setupToken claims/exp边界/provider/subject、重放、bind、精确 redirectUri；保留 React callback/state/URI 测试 |
| 查询/管理 | brief/full/listText/attList；cursor/timeSort/latest/star/allReceive；用户 offset；角色 CSV；注册码/账户/删除/恢复；跨用户范围及已存在错误 |
| 设置 | D1→KV→HTTP缓存→admin遮罩→websiteConfig；变量 JSON string/array、0/1/2、patch serializer；完整字段/NULL，缓存 mutation 顺序 |
| 发件 | 纯站内/纯站外/混合、reply、Cloudflare优先/Resendfallback；image/CID/普通附件/空附件/超过限制；provider count与原副作用/失败顺序 |
| 收件 | raw/MIME字节、plus-address精确/回退、黑名单/无收件人/角色/AI；SAVING/isDel→附件→complete→通知；AI/TG/forward/webhook各自异常 |
| 存储/删除 | S3→R2→KV选择；同内容hash共享key；普通/EMBED引用；email/account/user删除、star、对象失败/重复key；不混入GC新策略 |
| cron/init | 两种cron分支、串行顺序/首失败、UTC重置、接收恢复/清理/统计/OAuth；fresh/repeat/partial init 只在隔离D1 |
| 部署 | 四入口+生成入口；assets目录/name/date/flags/cron/资源ID/vars不漂移；两条部署路径保持原绑定恢复语义 |

已知 bug 的 characterization 标明“记录旧行为”，不作为长期安全目标。修复包使用新的目标断言并明确差异；禁止把错误行为快照当作永久不许修复的理由。

## 7. 阶段顺序、工作包、出口与回滚

共同门槛 G（P1 起）：types:check、typecheck、lint、关联 Node/contract tests、Worker dry-run、git diff --check。每次源码改动必须跑关联契约；完整 frontend build/全部 worker contracts 在每阶段出口跑一次，不重复无新信息的检查。未迁 JS 数/源文件覆盖在记录中可见；“0 TS 错误”不能冒充“已检查全仓库 JS”。

### Phase 0：把行为基线变成可重复运行的门槛

**文件**：package.json/lockfile 的测试工具依赖；scripts 两个源码 loader 测试 + 新 helper；test/fixtures/unit/contracts/helpers；mail-react/scripts/compat-audit.mjs；验证 CI。业务源码不改。

**工作包**：

1. 固定提交/65路由/配置/key/响应/DDL/前端消费基线；保留已有 34 测试。
2. 接通 JS/TS 编译 loader；先跑未迁 JS，增加真实 D1/KV/对象/HTTP/事件验证。
3. compat-audit 用 AST 找 websiteConfig 方法及 return 字段、table属性；兼容 JS/TS，不按精确源码字符串截取。现有生成报告不自动成为 goldens。
4. 新安全 test scripts；CI 只验证、不触发 deploy/init；建立第 8 节发布关卡。

**完成标准**：基线原 JS bundle 的测试全绿；关键邮件/认证/数据库轨迹可比较；外网被阻断；没有依赖真实生产资源；新 test 不再部署。仅 smoke/空fixture不能算完成。

**命令**（新增脚本前，仓库根目录）：

~~~powershell
pnpm -C mail-worker install --frozen-lockfile
pnpm -C mail-react install --frozen-lockfile
node --test mail-worker/scripts/attachment-routing.test.mjs mail-worker/scripts/oauth-setup.test.mjs mail-worker/scripts/prepare-build-deploy.test.mjs mail-react/scripts/oauth-callback.test.mjs mail-react/scripts/turnstile.test.mjs
pnpm -C mail-react run lint
pnpm -C mail-react run build
pnpm -C mail-worker exec wrangler deploy --dry-run --config wrangler-dev.toml --outdir .wrangler/phase0-baseline
git diff --check
~~~

新增工具的那次安装单独用 pnpm add -D -E 锁定上述版本；更新 lock 后重新 frozen 安装，不将它夹在源码改名中。test:node/test:worker 建立后各执行一次，fixture baseline 留存。

**回滚**：工具/测试/CI提交独立撤回，原 JS 应用与部署入口仍在。没有数据库回滚。

### Phase 1：TypeScript 工程，不改入口

**文件**：package.json、lockfile、tsconfig.json、eslint.config.mjs、worker-runtime.d.ts；四配置读取校验。

**工作包**：加本包 tsc/ESLint；runtime-only types；allowJs/checkJs/strict 配置；typecheck/lint/build/verify 脚本。

**完成标准**：原 JS 仍可打包/本地运行；TS 空白期检查覆盖明确；Worker runtime 不被 DOM/Node 声明替换；依赖无生产升级，src/index.js 仍是 main。

**命令**（仓库根）：

~~~powershell
pnpm -C mail-worker run types
pnpm -C mail-worker run types:check
pnpm -C mail-worker run typecheck
pnpm -C mail-worker run lint
pnpm -C mail-worker run test:node
pnpm -C mail-worker run build
~~~

**回滚**：工程/lockfile一组回滚即可；P0行为测试仍可单独运行。

### Phase 2：基础协议，分清 Context 与数据形态

**文件**：types/env.ts、context.ts、auth.ts、settings.ts、mail.ts、attachment.ts、api.ts、admin.ts；仅按本批消费者创建，禁止预填空文件。

**工作包**：Env/能力Context → auth/KV claims → settings/cache → 邮件/附件/管理DTO。对当前不可靠返回保持 unknown/union，局部业务类型靠之后 schema 补全，不伪造所有字段都必有。

**完成标准**：HTTP与{env}均能表达；公开Context user可缺；refresh set能力单独；JWT/DTO/Row相互不混用；三个 handler 类型样例能够检查，生产入口未切换。

**命令**：G；test:node；test:worker 中配置/会话/响应分组。无运行时导入新增，基线轨迹差异为零。

**回滚**：纯类型提交可回滚；后续引用它的提交作为依赖一并撤回，不保留幽灵声明。

### Phase 3：低风险基础模块原位转换

**文件/分批顺序**：

1. constant/kv-const、time/domain/verify 小工具、result/BizError。
2. crypto/file/email/date 工具；zh/en；date插件与原资源初始化不能丢。
3. JWT/req 工具，模板输入类型；const/entity-const 多余 service import 先保持，去环在 P8 有装配基线后处理。

**完成标准**：每个转换文件 strict 0错误、无 any；JWT/bytes/hash/key/DOM/日期/falsy/默认code契约一致；显式 .js import 已同步；既有 Nodeloader 编译TS成功。

**命令**：G；test:node；unit 中 result/JWT/hash/codec/date/template；test:worker 检查模块加载顺序、响应和对象key。

**回滚**：每一小批后缀/消费者/测试定位一起 revert；不保留原 .js 副本“方便回退”。

### Phase 4：表映射、ORM与现有DAO

**文件/分批顺序**：

1. entity/perm、role-perm、star、reg-key、role、account。
2. entity/user、oauth、verify-record、att；纯 $type 历史 union，保留默认值/NULL。
3. entity/email、setting；lib/email-list-columns；compat-audit 路径/AST验证。
4. entity/orm、dao/analysis-dao；补 types 的真实 RawRow/aggregate 类型。

依赖可按实际编译微调小批顺序；没有把全部业务查询提前搬入 Repository 的前置要求。

**完成标准**：12表映射、SQL/params、mapper和localD1结果一致；无DDL；没有globaldb；JSON/CSV默认/写入值保持；init仍JS。

**命令**：G；unit SQL/params；test:worker 中D1/schema/projection/统计；React audit:compat（会重写生成文档，检查仅有定位变化）；frontend build。

**回滚**：schema代码/ORM/类型/test小批原子回滚；没有数据库schema降级步骤。若SQL或params改变即本批失败，不能以“DDL没改”放行。

### Phase 5：存储与Service，按依赖分六组

这一阶段最复杂，每一组内部仍拆多个小提交；不是把22个Service同时改TS。

| 分组 | 文件/真实先后 | 完成标准与关联验证 |
| --- | --- | --- |
| P5A 叶子能力 | kv-obj→storage/kv；analysis-service | root附件GET/HEAD/404/405/legacy路径、KV metadata/key；分析SQL与缓存值；先保留JS caller |
| P5B 设置与基础业务 | settings-reader原query；verify-record/perm；setting facade；S3/R2 leaf与选择；role/reg-key | settings↔storage反向依赖解除；缓存mutate/read次数不变；刷新set约束；CSV/0/1/额度；storage优先级/所有返回union |
| P5C 外部边界 | AI、Turnstile、webhook、Telegram client；telegram业务与模板 | unknown收窄；所有外部payload/catch/retry政策一致；无secret/client全局缓存；HTML/text区别 |
| P5D 认证/管理 | user/account方法批→login→oauth/provider→public；user-context | D1/KV/session DTO分离；三家OAuth/setup；注册/角色/邮箱/额度/删除；依赖循环用facade和types桥，不改事务 |
| P5E 邮件读取/附件 | email查询/dao/list DTO；star；attachments/content；att持久化/清理 | brief/full/cursor/attList、引用/key/转换；失败注入；不顺手改权限、MIME、共享CID规则 |
| P5F 邮件编排 | provider→onsite→send→maintenance；resend回调；email-service收口TS | 原副作用次序/provider次数/异常形态一致；入站仍由原Email handler调用；没有新operation表/queue/重试策略 |

**命令**：每组 G + test:node + 对应 test:worker 分组；P5D 额外 React OAuth/Turnstile Node tests；P5B/P5E 额外 audit:compat 与 frontend build。阶段出口完整 verify/build。

**静态阻断**：若 logout缺await、reg-key Promise/Drizzle returning误用等使诚实类型无法成立，先留JS实现并登记独立小型bug包。修复使用目标测试、差异说明、独立commit，完成后再类型化；P8之前必须关闭这种暂留点，不能用Promise断言成string/row逃过检查。

**回滚**：每组 facade/export/import+类型+测试联动回滚；同一阶段不引入持久schema/key。邮件已经外发或对象已经删除无法由git撤销，回滚代码不等于回滚副作用；上线观察见第8节。

### Phase 6：Hono、Security 与 API 原位类型化

**文件/顺序**：hono/hono→error handler、i18n/i18n、security/security；随后 17 API按公开/设置→管理→认证/OAuth→邮件/对象/回调分批。hono/webs仍显式副作用 imports，类型化但不先换factory。

**完成标准**：new Hono<AppEnvironment>；回调/DTO/Context有类型；security执行后用户能力可证；全部65URL/method与response相同；错误分类仍按现有兼容规则；没有新Controller、新校验框架或默认400。

**命令**：G；完整 test:worker 的HTTP/路由/Auth/OAuth/错误/对象；test:node；React lint/build、34原基线 tests；audit:compat。

**回滚**：单API批可回滚；Hono泛型/错误handler/i18n类型批一起回滚，保持唯一app实例。不能留下向两实例注册的混合状态。

### Phase 7：真实 Email/scheduled/fetch 与入口切换

**文件**：email/email.js→email/receive.ts；index.js→index.ts；四份TOML main；prepare-build-deploy.mjs/.test.mjs；所有入口测试定位。

**工作包**：

1. receive handler类型化，保留raw解码、setReject/accept、副作用和降级；handlers签名精确。
2. index 使用 satisfies ExportedHandler<WorkerEnv>，三个method保持原条件/await顺序。
3. 在同一提交同步五个入口来源（四TOML+生成配置脚本），生成配置测试断言main；不要覆盖资源绑定或change date。

**完成标准**：真实bundle三个handler可运行；entry不承担业务；assets/附件legacy分派不变；cron两分支和首失败传播不变；生成/实际配置main一致。

**命令**：G；完整test:worker；prepare-build-deploy.test；frontendbuild；四配置检查与 dry-run（action只用脱敏替换的临时配置，不用占位/真实生产配置执行）；本地 dev smoke。

~~~powershell
pnpm -C mail-worker exec wrangler dev --local --config wrangler-dev.toml --ip 127.0.0.1 --port 8797 --persist-to .wrangler/phase7-local
~~~

在该进程中验证SPA/API/对象/OPTIONS后退出；不得以服务启动替代请求验证。生产Cron/Email投递需之后隔离预生产验收。

**回滚**：index/receive、四main、生成脚本与测试一起回滚。配置不能先改main再下一提交加index.ts；回滚不触发init。

### Phase 8：结构收尾与清除JS过渡

**工作包**：

1. init 原位TS独立转换，用 fresh/repeat/partial本地fixture证明行为；不重写历史迁移链。
2. 显式 registerXxxRoutes/registerSecurity/registerI18n 全部准备完，最后一个原子装配提交切到 createApp。此前每个准备包仍保留单一side-effect路径，不能重复注册。
3. app.ts 顺序固定CORS→i18n→security→routes。i18n不再import app；auth-policy/常量不再import业务；保留dayjs/resources初始化。
4. 按表将provider/工作流移到最终路径，删除已无调用的转发wrapper。不为目录整齐批量改service/entity名字。
5. 删除空test-api和重复user-api import；消除src业务JS，allowJs:false；启用全部TS lint门槛。删除被替代的HelloWorld/Vitest旧依赖/config，确认无消费者。
6. 更新AGENTS实际路径/命令及迁移记录；不提交dist/.wrangler。

**完成标准**：src只剩TS实现；所有过渡点有删除证据；17endpoint模块显式注册、65路由不重复；无app/service反向初始化依赖；无ignore/nocheck/as any/业务any；strict全src；没有与迁移无关重命名/功能改造。

**命令**：完整verify/build、audit:compat、Reactlint与34基线；架构/初始化顺序contract；源码扫描忽略generated/deps，确认无JS/禁用语句；git diff --check。

**回滚**：init、explicit-registration、provider搬迁、JS清理分别独立commit。显式注册的最终切换必须整组回滚，不能只revert app.ts；allowJs关门仅在全部TS之后，回滚上游JS包时同步还原配置。DDL不变，所以无需数据库降级。

### Phase 9：完整验收与隔离预生产

**文件**：原则上只修验证暴露的问题/记录结果；不加入新业务。

**完成标准**：第9节全部达成；无法本地模拟的S3/AI/email/OAuth等能力有隔离预生产证据，未测项明确列出，不能用stub或dry-run宣称生产已等价。

**命令**：干净checkout/frozeninstall→types:check/typecheck/lint→Node基线+unit→Reactbuild→全部Workercontracts→目标resolvedconfigdryrun→本地smoke→隔离预生产契约验收。发布命令只在后续明确上线工作中执行；本方案不部署。

**回滚**：回到最后完整验收的代码+配置+lockfile版本；保持原db/kv/r2资源和vars。若独立bug包已有数据/不可逆副作用，按该包专属预案处理，不声称git revert能恢复邮件/对象/用户状态。

### 阶段验证命令索引

以下均在仓库根目录执行，脚本按 P0/P1 建立后适用。verify 包含完整 Worker 类型/lint/Node/合同检查；从干净 checkout 必须先 build，再 verify，因为 test:worker 的 Wrangler 打包需要 dist 已存在。已有本次有效 assets 时小批可直接 verify/关联合同；每个阶段出口仍跑完整 build + verify。

| 阶段 | 可直接执行的出口命令 |
| --- | --- |
| P0 | 本节 P0 的现有命令；新脚本建立后 pnpm -C mail-worker run test:node 和 pnpm -C mail-worker run test:worker |
| P1 | pnpm -C mail-worker run types；pnpm -C mail-worker run build；pnpm -C mail-worker run verify |
| P2 | pnpm -C mail-worker run build；pnpm -C mail-worker run verify |
| P3 | pnpm -C mail-worker run build；pnpm -C mail-worker run verify |
| P4 | pnpm -C mail-worker run build；pnpm -C mail-worker run verify；pnpm -C mail-react run audit:compat |
| P5 | pnpm -C mail-worker run build；pnpm -C mail-worker run verify；node --test mail-react/scripts/oauth-callback.test.mjs mail-react/scripts/turnstile.test.mjs；pnpm -C mail-react run audit:compat |
| P6 | pnpm -C mail-worker run build；pnpm -C mail-worker run verify；上述 React Node tests；pnpm -C mail-react run lint；pnpm -C mail-react run audit:compat |
| P7 | P6 命令 + 四配置/生成入口检查与已列出的 Wrangler 本地 smoke；临时解析的目标配置 dry-run |
| P8 | P6 命令 + 源文件/禁止语句/旧入口扫描、初始化顺序和 init fixture（纳入 verify） |
| P9 | 双包 frozen-install、P8 全量命令、resolvedconfig dry-run、本地与隔离预生产验收；不以远程 deploy 当验证命令 |

Phase 0 固定合同测试分组文件，例如 http/auth/oauth/settings/mail-query/mail-send/mail-receive/storage/maintenance/init/configuration.test.mjs。局部命令为 pnpm -C mail-worker run build:worker 后，从 mail-worker 运行 node --test test/contracts/storage.test.mjs 等真实文件；测试文件名与分组必须在 Phase 0 落地，不能把一个尚未存在的筛选器当完成证据。

## 8. 发布安全与阶段回滚边界

“每阶段可部署”表示构建产物和运行配置完整，不表示每个阶段都自动发布生产。各小批通过可发布关卡后才进入隔离环境；没有未提交的半个入口切换。

必须在上线前处理现有两个部署陷阱：

1. default TOML缺db/kv，keep_vars不恢复资源binding。核对resolvedconfig的原D1/KV/R2资源ID/name、email能力、assets、vars、cron；缺项停止发布，不新建替代云资源“让它能跑”。
2. Actions每次deploy后调用/api/init，而init并非幂等；纯TS发布也可能改数据。Phase0应增加独立的“仅发布代码、已有库不重复init”的明确部署关卡/路径；改变自动init策略作为已确认阻塞问题的独立部署工具修复审查。保留init API与首次安装能力，不把历史SQL修复混入该提交。关卡未落实前，不沿现有main自动部署链上线迁移提交。

Workers Builds的prepare脚本有分支限制、历史binding恢复与生成main；不顺手放开分支或改变恢复策略。验证时mockCloudflare versions，不调用真实生产API。

| 改动类别 | 可回滚单位 | 数据/外部边界 |
| --- | --- | --- |
| 类型/后缀/纯函数提取 | 源码+imports+测试定位/类型 | 通常代码回滚即可；禁止混schema/key变更 |
| 工具/lock/config | 工具脚本+锁+生成声明；入口五处同步 | 重新build并使用原资源配置，不执行init |
| Hono显式注册 | 全部装配切换包 | 保持同一路由/认证；不混旧单例和新app |
| 邮件/删除编排提取 | facade+提取模块+依赖注入 | 已发/转发/删除不可撤销；观察provider次数与对象引用 |
| 已确认bug修复 | 专属commit/目标测试/差异说明 | 根据副作用设计回滚；若有schema/key变更移出本次纯迁移 |

上线观察至少包括既有错误码比例、登录/OAuth/setup成功率、收件完成状态、发件provider失败/重复、附件404、scheduled错误、D1/KV写入错误。迁移不新增数据格式，旧版本必须继续能读取新版本写出的数据。出现契约漂移、资源绑定差异或邮件重复立即停止后续小批，回退到上个验证版本。

## 9. 最终验收清单

- [ ] 全部原82源码文件在映射中有去向；空test-api被有证据删除，业务src不存在双实现/未登记JS岛。
- [ ] 全src strict typecheck、合理TS lint通过；无业务any/as any/ignore/nocheck；generated声明与锁定Wrangler配置一致。
- [ ] 65method/path、参数/默认/response/status/header/cookie/JWT/OAuth与基线一致；独立bug差异逐项列出且有目标验证。
- [ ] DDL/索引/列/key/绑定/变量名不变；Drizzle runtime builder/default/mode和代表性SQLparams未漂移。
- [ ] 邮件站内/外发/混合/reply、入站plus/MIME/附件/AI/推送、删除/定时的状态与副作用轨迹通过。
- [ ] KV key/JSON/TTL，R2/S3/KV object key/bytes/metadata，providerpayload与调用次数保持兼容。
- [ ] 原34Node测试保留；新的真实D1/KV/R2/workerd合同测试、失败注入、JS-vs-TS对比通过；前端业务未被改造。
- [ ] Reactbuild/lint/compat审计通过；assets/PWA与旧附件URL用真实Wrangler验证；bundle无异常增长/缺模块。
- [ ] 四TOML与生成入口全部index.ts；date/flags/cron/原资源未变；生产type-only部署不会重复init。
- [ ] 干净安装/构建/本地运行可重现；测试命令不部署，部署有独立验证门槛与回滚记录。
- [ ] 无法模拟的第三方/Cloudflare能力在隔离环境验证，证据和未测范围准确；没有把本地成功写成线上成功。

## 10. 本轮交付与下一步

本轮只交付本方案，业务/工程配置未改，没有安装新依赖、执行生产部署或远程init。可执行的起点是Phase0的行为基线与测试工具工作包；后续逐个阶段进入，不从全目录改后缀开始。

本轮额外验证：Wrangler types参数及--check；runtime-only生成；strict混合工程/Hono/handlers小样；Drizzle $type桥接与原SQL/params比较；真实bundle的Miniflare本地D1/KV/R2、邮件/scheduled和受限制的原生发件binding；已有源码测试、compat-audit、四入口和生成入口的实际依赖。临时验证均在被忽略的.wrangler/audit-evidence；init只在隔离本地D1执行。业务完整类型检查、全量新契约测试和上线验收是后续阶段工作。

参考工具链依据：[Cloudflare类型生成](https://developers.cloudflare.com/workers/languages/typescript/)、[Hono Context](https://hono.dev/docs/api/context)、[TypeScript allowJs](https://www.typescriptlang.org/tsconfig/allowJs.html)、[Cloudflare Vitest包迁移](https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-to-vitest-plugin/)。执行时以本仓库锁定版本的CLI/API为准，不照抄最新版模板。

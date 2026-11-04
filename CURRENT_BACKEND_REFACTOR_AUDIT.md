# CURRENT_BACKEND_REFACTOR_AUDIT

审计更新日期：2026-11-04（Asia/Taipei）。仓库：D:/MailServer/cloud-mail。Git HEAD：b4b0b421a07673dc96b8da935211f895dfb35fcb，当前分支：frontend-react-rewrite。

**当前仍有实质性技术债。主要集中在邮件大服务、附件阶段对象、会话读写、配置视图、跨资源副作用和历史数据库升级。TypeScript 工程、显式路由装配、持久化叶子和部分外部协议边界已经落地；这些完成项不能再当作未修问题。**

本报告同步已批准的S-USER-LIST实际完成态：用户列表使用明确投影与响应类型，不再输出password/salt。范围仅两个生产文件、两份专属测试及AGENTS/本报告；没有部署或进入其他批次。B2-B历史证据见8.2，本包执行与退出证据见8.3；其余债务未因此标完成，旧实验未重跑的地方保留限制。

## 1. 证据范围与当前工作区

- 本包开始378文件、Git status267项；结束380文件，改4个原文件、新增2个测试，其余374文件哈希保持。HEAD/分支及已有未提交迁移保留，未整理索引或提交；API/前端/Entity/DAO/login/security/配置/依赖/锁文件未改。
- 当前src仍为 **114个非声明TS模块、1个手写linkedom.d.ts、0个业务JS**；物理行8,356。重算 **367条本地运行时import边、0环、0 DAO反向边**；没有新增运行时模块或改变运行时依赖图。
- userService除list外20成员原样；list的参数、join/where/分页、总数、原userIds/types和七路调用保留。仅SQL投影移除两凭据，末尾以map构造完整响应；userService仍有6直接消费者，不能宣称大服务已拆分或fan-in下降。
- 阶段A在旧实现先建立14项Node+6项Worker非凭证基线，完整build/verify通过（148 Node+83 Worker）。随后追加安全负例，旧实现的SQL/响应及admin/仅user:query两种HTTP身份明确失败，诊断只输出键名/布尔值。
- 阶段B显式15个user+5个OAuth查询列，返回六计数+sendAction，共27键。安全负例变绿，全部旧基线前缀/fixture/预期不变；完整build/verify通过（149 Node+84 Worker，无skip/todo）。两个阶段build均含React assets与Wrangler dry-run，不访问生产。
- 真实本地HTTP保护DB password/salt保持、两次原密码登录/错误密码拒绝、完整私有会话/旧token保留、跨日actor metadata/KV刷新；列表安全投影没有裁剪内部UserRow/SessionUser。

证据等级：**源码确认**为当前执行分支；**本地复现**为真实模块/本地SQLite/KV/workerd的指定断言；**风险推导**为代码可达但未复现所有平台条件。生产实际发生、历史数据分布、线上频率/负载、云资源和漏洞利用均为**未确认**。没有覆盖率仪器数据；测试全绿不等于全部政策、并发和生产条件已验证。

## 2. 当前真实架构

### 2.1 入口、HTTP 和事件边界

[src/index.ts:10](D:/MailServer/cloud-mail/mail-worker/src/index.ts:10) 导出的对象满足 ExportedHandler<WorkerEnv>，有 fetch、email、scheduled 三种路径，没有队列 handler 或独立 Node Server。

~~~text
fetch(Request, env, ctx)
  /api/* → 去掉 /api → app.fetch
    createHono: CORS + handleError
    registerSecurity → 对应 register*Api → Service
    → DAO/直接 Drizzle/raw D1、KV、对象存储、Integration
    → JSON envelope，或该端点自己的文本/HTML/流响应
  /static/*、/attachments/*、/mail/attachments/*
    → 旧附件路径规范化 → kvObjService.toObjResp({env}, key, req)
  其他 → env.assets.fetch

email(message, env, ctx)
  → email/email.ts 全流程编排 → 设置/账户/角色/AI
  → email.receive → 附件对象与引用 → completeReceive
  → Telegram / message.forward / webhook

scheduled(controller, env, ctx)
  */30 * * * * → 仅统计缓存刷新 → return
  其余 → 验证记录清理 → 日发送数重置 → SAVING 恢复
        → autoClean → 统计缓存刷新 → 未绑定 OAuth 清理
~~~

[hono/hono.ts:6](D:/MailServer/cloud-mail/mail-worker/src/hono/hono.ts:6) 的 createHono 负责公共 HTTP 中间件及异常映射；[hono/webs.ts:21](D:/MailServer/cloud-mail/mail-worker/src/hono/webs.ts:21) 的 createApp 先注册 security，再明确调用 17 个 API 注册函数，最后生成默认 app。两级 factory 服务于同一装配路径，不是两份应用实现。真实注册的 **65 个 method/path** 与冻结 fixture 一致。

当前 TOML 普通部署 cron 为每小时 0 * * * *；dev 没有 triggers。代码中的半小时分支存在，但当前配置未启用。任务全部顺序 await；前一步抛错会停止后面的步骤。返回的事件 Promise 承担当前生命周期，未用 waitUntil 本身不能判错。

当前认证按 security.ts:95–175 的真实分支执行：exclude前缀直接放行；其余/public路径比较KV public_key:与原始Authorization；普通路径验证HS256→读取auth-uid:→检查tokens→对requirePerms命中的路径查D1权限，cached email等于env.admin时免权限限制→按日刷新→c.set('user')。OAuth setup与Telegram查看另在Service验证不同用途的签名内容，不是普通会话。登录不设置Cookie，Authorization没有Bearer前缀。普通JSON成功为code/message/data，失败通常HTTP200且code在payload；init/webhook文本、Telegram HTML、对象流另走端点协议。

### 2.2 模块职责与实际依赖方向

| 模块 | 当前实际职责 | 真实边界 |
| --- | --- | --- |
| api/（17） | 读取 query/path/body、取得身份、调用业务、包装端点响应 | 已承担 Controller 职责；不需要重复 Controller 层 |
| hono/（2） | 工厂、注册顺序、默认 app | API 不反向 import app，已消除副作用路由注册 |
| security/（3） | JWT/KV 认证、路径权限映射、用户/claims 读取 | 认证 middleware 仍直接依赖 userService/permService |
| service/（25） | mail-query-service/all-mail-query-service分别处理个人/全站读取；其他Service处理用例、存储、配置、维护/通知 | 两种列表读取已退出写入大服务；收发/删除/维护等边界仍待处理 |
| dao/（7） | user/account/email/att/star/oauth 复用持久化叶子，analysis raw 聚合 SQL | 没有反向依赖 service/Hono app |
| entity/（13） | 12 张表的 Drizzle builder 与 ORM 工厂 | orm(c) 每次使用当前 env.db，不持有全局连接 |
| integrations/（5） | mail-sender、oauth-client、ai/turnstile/s3 gateway | Resend/AWS SDK 的运行时 import 已集中；TG/webhook fetch 仍在 service |
| email/email.ts | 入站事件和完整接收编排 | 仍同时组织多种策略、持久化和通知 |
| types/ | Env/窄 Context、DTO、会话、邮件/附件及 Drizzle 推导类型 | 提供静态协议，不能验证请求/KV/D1 的实际 JSON |
| error/model | BizError、unknown message、HTTP 兼容映射、JSON envelope | 保留 HTTP200 + payload.code 等既有协议 |
| init/ | 初建、全部历史 DDL、回填、权限种子、配置刷新 | 不是自动 Drizzle schema 同步/有版本账本的 migration runner |
| lib/utils/template/i18n/const | 查询投影、兼容参数、纯转换、展示、翻译、常量 | 少数兼容桥有真实长期用途；模板另有安全边界 |

数据访问的实际结构是 **API → Service → DAO 或直接 Drizzle/raw D1**。6 个 DAO 和 16 个 Service 直接 import ORM，共 22 个消费者；analysis DAO 直接用 D1 raw SQL。不能声称所有数据库访问已经经 Repository，也不能把一个简单原位查询自动判为分层错误。

运行时关键依赖（排除纯类型 import）：

~~~mermaid
flowchart TD
  Entry[index.ts] --> App[hono/webs createApp]
  App --> API[17 API registrars]
  App --> Auth[security]
  Entry --> Inbound[email/email]
  Entry --> Maintenance[维护 services]
  API --> Personal[mail-query-service: personal reads]
  API --> AllRead[all-mail-query-service: global reads]
  API --> Star[star-service]
  API --> Mail[email-service]
  Personal --> DAO[DAO leaves]
  Personal --> Assembly[summary + attachment association]
  Star --> DAO
  Star --> Assembly
  AllRead --> DAO
  AllRead --> Assembly
  Inbound --> Mail
  Inbound --> Attachment[att-service]
  Mail --> Attachment
  Mail --> Sender[integrations/mail-sender]
  Mail --> Role[role-service]
  User[user-service] --> Account[account-service]
  Account --> Mail
  User --> Mail
  Login[login-service] --> User
  Login --> Account
  OAuth[oauth-service] --> Login
  Auth --> User
  Mail --> DAO
  User --> DAO
  Role --> DAO
  Attachment --> Storage[r2-service selector]
  Storage --> S3[s3-service + s3-gateway]
  ReadCallers[login/account/user/oauth + inbound] --> Reader[settings-reader]
  SettingAPI[setting API + init] --> Writer[setting-service]
  Writer --> Reader
  Writer --> Storage
  Storage --> Reader
  S3 --> Reader
~~~

图只展示本次拆分最重要的实际边，不是完整所有 import 图。各 Service 还可以直接访问 entity/ORM；它们没有用新增目录名伪装成完全解耦。

### 2.3 主要调用链与资源

- **HTTP 邮件读取**：email-api → userContext → mail-query-service的listPersonalMail/latestPersonalMail → 账户回退/Drizzle → attDao与无IO装配 → result.ok。全站all-email-api直接调用all-mail-query-service的listAllMail/latestAllMail，经D1/attDao与相同无IO装配返回；授权留在security，不传userId范围。星标有自己的SQL，public查询独立；过滤、分页和返回形态没有统一。
- **发送**：email-api → emailService.send → settingsReader → attService.toImageUrlHtml → 用户/角色/发送账户/回复判断 → Cloudflare Email 优先、否则 Resend，或全部站内 → 用户计数/发件记录 → 附件 → 站内副本 → KV 日统计。顺序的失败含义见 D01/D05。
- **接收**：email/email.ts → settingsReader.query → raw 字符串/PostalMime → exact 账户、找不到再 plus base → 角色/黑名单/无人收件 → AI gateway → SAVING/isDel=1 行 → 对象/附件引用 → completeReceive → 三种通知。
- **用户列表**：user-api→userService.list→显式15个用户列+5个OAuth列→await总数→七路统计/角色读取→map补全六计数/sendAction→UserListPage/result.ok。只移除password/salt；LEFT JOIN后分页和user-only total保留，当前并不修复一对多重复。响应类型在types/user.ts，不等于完整UserRow。
- **登录**：login-api → loginService.login → D1 用户/状态/密码 → HS256 JWT → auth-uid:<userId> KV tokens 读改写 → userService.updateUserInfo → KV30天 TTL。middleware 验证 KV tokens 并按日刷新；普通 JWT 生成没有 exp。
- **OAuth**：oauth-api → oauthService → oauth-client 的三家 code/userinfo 协议 → profile 字段转换与 D1 保存 → 已绑定走 login；未绑定返回900秒 purpose=oauth-setup 的证明。bindUser 验证明、身份、开关，再 register→绑定→login。前端 callback/state 不在 Worker 内执行；本轮未改变前端。
- **对象**：att/setting → r2Service 选择完整 S3配置 → R2 binding → KV；S3 Service 查设置再委托 AWS gateway。直接附件 URL 固定走 KV，OSS URL 动态选后端，两种入口当前共存。
- **初始化**：GET /api/init/:secret → init 比较 jwt_secret → intDB→v1_1…v3_3 全部历史步骤→setting.refresh→文本 success。真实 SQL 定义 schema，无 migration 版本表。

绑定类型在 [types/env.ts:2](D:/MailServer/cloud-mail/mail-worker/src/types/env.ts:2)：db、kv、assets、domain、admin、jwt_secret 为必需类型；r2、ai、email 和其余 vars 可选。默认 TOML 仍是缺 db/kv 的配置模板；声明必需不代表模板已有资源。types/context.ts 区分 HttpContext、EnvContext、DatabaseContext、ConfigRead/WriteContext、RequestMetadataContext。

12张表为user、account、email、attachments、star、role、perm、role_perm、reg_key、oauth、verify_record、setting。recipient/cc/bcc与resendTokens为JSON TEXT，角色/过滤字段使用CSV，reg_key的主键列仍为rege_key_id；没有自动schema同步或业务关系级联外键。表/索引、代表CSV/JSON/SQL参数、KV key、附件哈希 key、变量名均有本地冻结或合同检查。生产 D1 的实际版本、NULL/重复数据和当前资源 ID 归属**未确认**。

### 2.4 状态、配置和初始化

- 模块级 app、service 函数对象、schema、常量和 TextEncoder 没有把请求 c/env/user 保存为全局可变数据。当前没有确认到请求用户跨请求全局泄漏。
- i18next 资源模块加载时同步初始化一次，tFor(c) 获取 fixed translator；事件缺 req 时默认中文。dayjs 插件扩展是一次库能力初始化。两者有 import 副作用，但当前没有证据表明它们是错误初始化依赖。Turnstile 有遗漏，见 D09。
- Hono user/setting 为请求 Context 变量。settingsReader 命中返回同一个对象；settingService.refresh/raw、settingsReader.query/派生、settingService.get/脱敏共享该对象。问题是请求内角色混合及调用顺序，不是已确认的全局配置污染。
- email/scheduled 通过真实 {env} 能力调用，不制造 Hono req/get/set；事件缺请求缓存，因此有重复配置读取。
- Resend/S3 client 按调用创建，未保存跨请求 env/client。复用若要改，须是请求/事件内的明确依赖，不能换成全局用户相关单例。
- 全局 JSON 异常映射只覆盖 Hono API。assets、直接 KV、email/scheduled 不走该 onError；Resend webhook 自行文本 catch；Telegram/OSS 有专用响应。

## 3. 已经真实完成的工作

| 当前可核实的成果 | 当前证据 | 仍有边界 |
| --- | --- | --- |
| 全部业务 JS → TS，strict 工程完成 | src 扫描、tsconfig、types:check/typecheck/lint 本轮通过 | HTTP/KV 实际输入未因此自动验证 |
| 显式 Hono factory +17 registrars | hono/webs.ts:21–45，65 路由 contract | 路径权限清单仍手工维护 |
| 运行时循环消除 | check:source 与本轮 AST 图均0环；DAO/reader 为叶子 | 无环仍可高耦合、传过宽 Context |
| SDK/平台协议提取 | integrations/mail-sender/oauth-client/ai/turnstile/s3 | 收发业务流程/通知/存储返回形态仍混合 |
| 复用 DAO 与列表装配 | 7DAO、email-list-columns/text/attachments | IO留在查询调用方，各查询口径保留；其他无用alias仍在 |
| 用户列表凭据输出已修复 | userService.list显式20列、UserListItem/UserListPage、精确27键及SQL/HTTP安全合同 | DB/登录/KV私有UserRow保留；OAuth重复分页、字符串status撤销等仍未修 |
| 个人/全站读取独立并删除旧入口 | 两个query-service各有两个命名函数/私有过滤器，API直接调用 | 收发/删除/维护仍在emailService，不宣称全部邮件职责已拆分 |
| 设置只读依赖退出与 query facade 删除 | login/account/user/oauth/入站直接读 settingsReader；writer 内部也直接读；query 成员已不存在 | raw/cache/派生/遮罩仍共享请求对象，D10 未关闭 |
| logout 缺 await/-1 删错会话修复 | login-service.ts:272–276；login-session 专属测试 | TTL 省略和并发读改写仍保留 |
| 注册码角色查询 await、首计数返回行修复 | reg-key-service.ts:40；verify-record-service.ts:72；DB unit | 并发额度/首次计数仍未解决 |
| 请求语言隔离 | tFor、locale.test 交错 await | Turnstile 仍使用默认 t |
| CID 分类对象共享已落实 | email/email.ts:145–147、imgReplace；mail-storage-edge | 依赖原地 mutation 的跨阶段协议仍复杂 |
| 历史 D1 scalar/NULL 类型桥接 | entity $type；db-schema/db-bindings/db-types | mapper/DDL 默认差异有意保留；没有自动 schema 修正 |
| 测试不会部署；真正本地 Worker 契约 | package scripts、run-worker-contracts、严格出站 fixture | 有具体负例/并发/日界空白，见下文 |
| 普通 CI 发布不自动 init，发布配置有门禁 | deploy-cloudflare.yml:244；deploy-worker.mjs | 历史 init 本身没有被重写/版本化 |
| 空 test-api、time-utils、HelloWorld/Vitest 遗留移除 | 当前 src/配置缺失，HEAD diff 显示旧文件删除 | 未跟踪的新 TS/测试须一并提交才能形成完整迁移 |

AGENTS.md 已正确反映 TS、实际目录、handlers、factory、类型/DAO/integration、命令及大量保留风险。**尚有一处过度概括**：它说业务方法用 tFor(c)，Turnstile 当前仍用 t。旧迁移计划中的 email/send.ts、onsite-delivery.ts、content.ts、maintenance.ts、独立 TG/webhook gateway 等实际没有全部创建；不能把目标树或未勾选清单写成完成证据。旧前端 audit:compat 尚未适配，AGENTS 已如实提醒。

### 3.1 已闭合的设置读取批次

login/account/user/oauth/入站直接依赖settingsReader，writer内部也直接读；settingService.query已不存在。writer直接消费者仍为setting API/init（2），reader为12个消费者。D10的raw/cache/派生/遮罩共享对象未因此解决，本批未修改配置逻辑。

### 3.2 B2-A 执行历史与当时限制

| 方面 | 当前证据 |
| --- | --- |
| 个人读取 | mail-query-service 193物理行，两个公共函数/一个私有过滤器，13条本地运行时依赖；传递图不达emailService、attService、设置、角色、存储或sender |
| 星标读取 | 直接读attDao；传递图退出attService/r2/s3/settingsReader/s3-gateway；add/cancel和SQL未改 |
| 装配边界 | applyBriefListText统一brief mutation；attachListAttachments只关联已有行，保留顺序/严格ID/重复行/对象身份；IO与空集合分支留在调用方 |
| 旧入口 | emailService的list/latest/emailListFilters/applyListText/emailAddAtt/toListText成员已删除，无个人查询转发facade |
| 存量大服务 | emailService 970→786行，仍有25条本地运行时import、6个直接消费者；发送/接收/全站/删除/维护仍为真实职责 |
| 依赖计数 | 111→113模块、345→361条边，环仍0；**没有宣称总边数或循环数量下降**，收益是读取退出写入大服务、装配不持有资源 |
| 测试 | 先在旧实现建立12项Node和7项Worker基线；三阶段完整build/verify通过，最终118 Node+72 Worker全绿 |
| 兼容范围 | 14个非目标邮件方法及星标写方法保留；全站/星标SQL与参数不变；API只换两个读取目标，无schema/key/配置/认证变化 |

各列表的默认值、正文/摘要字段、最新标记、原ID绑定和空集合失败边界保留。新的查询单测不需要sender/存储/设置mock，这是实际依赖改善。整个app仍因其他业务加载发送SDK；生产性能、并发一致性与真实云行为仍为**未确认**。

### 3.3 S-USER-LIST完成态与结构复核

| 检查项 | 当前证据与结论 |
| --- | --- |
| 实际处理 | 关闭/user/list的password/salt输出。显式投影使新增Entity列不会自动成为HTTP字段，强类型27键响应取代完整DB行+Partial，不是搬文件。 |
| 职责与依赖 | 原方法内保留查询/统计，未拆整个userService；模块数/运行时边/消费者不减少。改进是持久化行与HTTP合同分离，构造完整响应时不修改原查询行。 |
| 重复与隐式依赖 | 没有双实现或通用sanitizer；删除getTableColumns(user)自动展开及旧Partial注解。固定Pick与投影显式列举字段，维护时须配合精确字段合同。 |
| wrapper/facade | 本包未新增/删除运行时wrapper。存量D17死alias仍待办，有真实用途的email/att桥及历史兼容仍保留，没有顺手清理。 |
| 环/反向/God | 当前114模块/367本地边、0环/0DAO反向边；未新增runtime模块或God对象。userService393物理行仍多职责，不把文件变大/变小当完成标准。 |
| 外部差异 | 唯一批准差异：每行29→27键，移除password/salt。其余键/值、权限/HTTP/SQL参数/时序/分页/OAuth/统计及登录存储保持。 |
| 测试与范围 | 旧14 Node+6 Worker基线先绿；安全负例先红后绿，原测试前缀冻结。当前149 Node+84 Worker通过；其他20成员和非目标源码未改。 |
| 剩余债与停止 | 本包仅关闭D11凭据响应子项。分页/状态撤销/会话/附件/发送/初始化等仍有原证据；没有发现本包新增实质债，也不自行规划或实施下一批。 |

B2-A/B2-B读取隔离仍已闭合。安全输出现在由明确查询投影、DTO和真实HTTP测试共同保护；类型本身并不验证任意运行时输入，也不代表其他端点的DTO/完整性问题已解决。

## 4. 剩余技术债：代码证据与影响

优先级：P1 为具体安全/数据完整性/确定性可靠性问题；P2 为显著结构、维护或测试成本；P3 为低风险收尾。**改造风险**单独给出，表示变更可能影响契约/持久状态的程度。它不等于问题优先级。生产修改频率和流量**未确认**；排序使用调用方数量、核心路径及现有测试作代理。

### D01 · P2 · 邮件服务仍承担收发、附件与维护多职责

- **位置/职责**：[email-service.ts:72](D:/MailServer/cloud-mail/mail-worker/src/service/email-service.ts:72) 的send（223行）、HandleOnSiteEmail:296–430（135行）；文件627行。HTML/CID、删除/恢复、接收完成及定时清理仍在；全站读取已退出。
- **已完成/剩余**：个人list/latest已在[mail-query-service.ts:19](D:/MailServer/cloud-mail/mail-worker/src/service/mail-query-service.ts:19)，私有过滤不经this；全站读取已在[all-mail-query-service.ts:15](D:/MailServer/cloud-mail/mail-worker/src/service/all-mail-query-service.ts:15)/:99；纯摘要/附件关联已共享。send仍组织配置、图片IO、用户/角色/账户、回复、供应商、D1/KV/附件与站内投递。原send分支启发式36、站内嵌套最多5层所对应方法未改，正式CFG圈复杂度未确认。
- **依赖/消费者**：21条本地运行时import；API、入站、scheduled、account/user共6个直接消费者。个人/全站读取已退出，但API模块因写接口仍import该对象，不能宣称fan-in减少。
- **测试**：新读取基线覆盖默认/分页/租户/过滤/字段/空集合/失败顺序；native/Resend/reply/mixed等既有合同全绿。角色配额、站内部分拒收/写入失败和图片超限仍缺完整合同。
- **收益/风险**：个人/全站读取包已闭合；其余发送/站内/维护尚未拆分。本批没修D05/D06，没有新增Controller或通用Repository。
- **本次退出证据**：旧三个全站成员和四条列表专用import（email-list-text、email-list-attachments、email-list-columns、attDao）已删除；其他16成员和2helper未改。新query只有all-email API一个直接消费者，API两个DELETE及其emailService依赖保留。

### D02 · P2 · 入站事件仍承载整条业务管线

- **位置/职责**：[email/email.ts:22](D:/MailServer/cloud-mail/mail-worker/src/email/email.ts:22) 的 email:22–212（191行）：配置、MIME、黑名单、地址归属、角色、AI、映射、附件、持久化、通知。
- **问题**：解析、规则、持久化状态、辅助降级在同一函数；要测试一种策略仍需组装多个 service/资源。14条本地运行时依赖，入口直接调用此函数。
- **消费者/影响**：index.email；内部依赖 email/account/settingsReader/att/role/user/AI/TG/webhook及 MIME工具。影响邮件拒收/接受、SAVING、附件和通知生命周期。
- **测试**：plus exact/base、无人收件、接收关闭/黑名单、AI失败、通知503、受控多chunk、附件INSERT失败已有；前一设置批次还补设置缺失/KV失败发生在读取 raw 与其他副作用之前；完整角色禁收组合、forward部分失败、completeReceive失败无专属合同。
- **收益/风险**：拆接收策略、持久化计划、通知用例，handler 保留顺序；风险中。raw字节与失败状态修复另见D05，不随拆分顺手改变。

### D03 · P2 · 附件阶段模型与对象 mutation 协议仍混杂

- **位置/职责**：[types/attachment.ts:17](D:/MailServer/cloud-mail/mail-worker/src/types/attachment.ts:17) 的 OutboundAttachment；att-service.toImageUrlHtml:44–141、saveSendAtt:143–168、saveArticleAtt:170–190；emailService.imgReplace:432–472。
- **问题**：同一对象拥有上传 content、buff、key、CID、MIME、DB归属，type 同时承担 MIME/业务分类；DOM转换同时读D1、读对象、算哈希。saveArticle 删除 buff，imgReplace 改 type。types 诚实描述了历史多形态，但还没有明确阶段不变量。
- **依赖/消费者**：attDao/ORM、r2Service、settingsReader、file/DOM工具；emailService、入站、email API消费；星标读取已退出attService。providers 再读取相同形态的附件。
- **影响/测试**：CID当前同对象是正确实现，禁止“优化”成独立克隆后丢分类。重复CID/共享key、缺省ID/key/boolean related、mutation顺序已有测试；multipart/related、偏移Uint8Array、空内容/MIME各阶段一致性缺覆盖。saveSendAtt:154仍用上传 type作 MIME，而前端提供 contentType，不能推断持久化MIME已经统一。
- **收益/风险**：拆上传、解析字节、正文来源、准备结果、持久化计划的类型/转换；DOM规划与执行分开。收益高，风险中高，第一批保留已有V1映射/身份/顺序。

### D04 · P2 · 存储返回 union、HTTP policy 和事件配置读取耦合

- **位置/职责**：[r2-service.ts:9](D:/MailServer/cloud-mail/mail-worker/src/service/r2-service.ts:9) storageType/getObj/putObj/delete；s3-service:8–30；types/attachment.ts:10 StoredObject；api/r2-api.ts:7–17。
- **问题**：R2ObjectBody/Response/null 回传业务层；OSS只读 httpMetadata，KV/S3 Response的 headers丢失，missing用 requiredRow进入旧异常路径。provider选择、S3 client、bucket分别查设置；env-only事件每个S3操作最多3次读取，可能跨读取拿到不同配置。读取次数由当前调用链确认，配置中途变更的生产发生情况**未确认**。
- **依赖/消费者**：r2→reader/s3/kv；s3→reader/gateway；att/setting读写、OSS API消费。index的canonical/legacy对象路径固定KV，另一能力入口有真实兼容用途。
- **影响/测试**：优先级、S3实际SDK请求、R2 OSS GET/HEAD、KV根路径404/405已有；OSS KV/S3元数据/缺失、配置切换、事件查询次数缺覆盖。
- **收益/风险**：定义底层对象读取结果与两种显式HTTP策略；操作内配置快照。风险中，统一URL/header/not-found语义风险高；不能直接删旧URL或自动改变provider来源。

### D05 · P1 · 收发状态与不可逆副作用缺少恢复边界

- **位置/职责**：[email-service.ts:185](D:/MailServer/cloud-mail/mail-worker/src/service/email-service.ts:185) /197 provider，250–256计数/入库，258–272附件限制/保存，282–290 KV日数；email/email.ts:52–61 raw解码、159–167附件catch；completeReceiveAll:500–512恢复状态。
- **问题**：外发被接受后才校验附件数量/执行DB、对象、KV，报错可能被误认为未发并重试；计数get/add/put无原子边界。入站每chunk新TextDecoder拼字符串，跨chunk UTF8/8bit会失去原字节；附件失败后仍completeReceive，恢复只改status而不恢复isDel，没有阶段完成证据/年龄门槛。
- **依赖/消费者**：mailSender、userDao、emailDao/ORM、att/r2、KV；HTTP send、入站、scheduled均受影响。
- **测试**：当前真实workerd确认“provider接受→D1失败”、对象写后附件INSERT失败仍完成、恢复isDel仍1。它们是缺陷诊断，不是永久正确契约；受控chunk测试是ASCII/base64，未覆盖UTF8/原始二进制。11附件、末尾KV故障、并发限额、正在接收时恢复无覆盖。
- **收益/风险**：单独设计字节输入、前置可失败校验、receipt/阶段结果、额度预留、幂等/恢复。收益高，风险高。D1与外发/对象不能通过文件搬迁获得一致性；本包未实施本项收发恢复修复。

### D06 · P1/P2 · 删除链分散、共享引用回收不完整

- **位置/职责**：[att-service.ts:202](D:/MailServer/cloud-mail/mail-worker/src/service/att-service.ts:202) removeAttByField:202–237；emailService.physicsDelete:477–481、batchDelete:600–610、physicsDeleteByAccountId:613–615；userService.physicsDelete:95–100。
- **问题**：全局COUNT(*)=1再删目标引用，会漏掉“同一被删对象有多个引用、删除后零引用”的key；DB记录先删，对象失败仅日志，缺重试依据。判断→物删期间新引用有竞态（本轮未复现平台并发）。按ID删除清star，条件/账号删除没有同样步骤；用户删除外层会清star，不能泛称所有删除都漏。
- **依赖/消费者**：attDao/D1、r2/S3/KV；个人/管理API、account/user删除、autoClean。表无该业务级联外键，协调顺序是实际规则。
- **影响/测试**：健康共享key顺序删除已有；前一设置批次补账户/个人删除的 syncDelete、主邮箱/归属校验、个人注销的 star/OAuth/会话清理；条件/账户收藏清理、同邮件重复key最终回收、对象故障恢复、并发新引用无完整合同。站内HandleOnSiteEmail复制attList（普通附件），正文图片引用另需登记；未确认生产损坏量。
- **收益/风险**：先明确各删除计划/范围，再抽编排；对象回收与站内图片引用作为独立完整性修复。收益高，风险高；回退代码不能恢复已删对象。

### D07 · P2 · 用户/注册/公开创建仍混合多个用例

- **位置/职责**：[user-service.ts:103](D:/MailServer/cloud-mail/mail-worker/src/service/user-service.ts:103) list:103–239（137行）、add:313起、loginUserInfo、密码/状态/删除/恢复；loginService.register:30–158（129行）；accountService.add:24–115（92行）；publicService.addUser:106–171。
- **问题**：列表join/分页/响应装配、角色域名、创建账户、设备IP、密码/会话、跨资源删除集中在Service对象。注册/管理/public各自验证和转换，规则已经出现差异；方法通过this隐式调用，不能安全解构。现阶段没有证据需要DI容器或每方法接口。
- **依赖/消费者**：user→account/email/role/perm/settings/DAO/KV/req/crypto；login→user/account/regKey/verify/Turnstile；OAuth→login。security、my/user/login/public/account API及事件消费。
- **影响/测试**：登录/logout/OAuth较强；前一设置批次补账户开关/COUNT 和账户/个人 syncDelete；授权用户列表现有专属基线及安全合同；管理创建/改状态/删除、跨路径plus规则和partial注册仍缺保护。凭据输出已在S-USER-LIST关闭，一对多重复仍在，见D11。
- **收益/风险**：先分user查询/响应、onboarding规则、session存储，再拆独立管理命令；各创建入口保留已有差异，修规则另批。收益高，风险中。
- **OAuth仍有的结构边界**：oauth-service.ts:20–32的profileValues直接理解Drizzle列encoder，:130–153保存/get查询仍在Service；oauth-client已有效隔离fetch，但unknown profile mutation、SQL保存和绑定/会话编排尚未分开。现oauth-contract保护三家协议/SQL/旧JSON形态、顺序replay；并发首次身份创建/同proof绑定无覆盖。可独立提取profile映射/proof decoder与DAO保存，不能把任意provider对象当OAuthRow。绑定:51–62在检查后创建用户，仅按oauthId更新；当前DDL没有身份组合唯一约束，竞争窗口源码确认，动态并发结果**未确认**。

### D08 · P1/P2 · 会话存储分散且并发读改写可恢复已撤销token

- **位置/职责**：[login-service.ts:243](D:/MailServer/cloud-mail/mail-worker/src/service/login-service.ts:243) 登录KV读改写、logout:272–276；security.ts:129–171按日读改写；userService密码/状态/删除中的KV操作；types/auth.ts:3以DB整行作为SessionUser。
- **问题/本地复现**：上次全量审计执行真实login +内存KV barrier，两个并发登录返回2 JWT，最终KV只保留1个新增token。真实security先读旧会话，在metadata await处暂停，再执行已修logout，随后refresh把current token写回。此为现存非原子操作，不是旧缺await。普通JWT无exp；logout put省略TTL；管理physicsDelete不删会话，middleware信任cached user。
- **依赖/消费者**：KV、JWT、userService.metadata、permService/管理员email；所有受保护API以及登录/管理/个人撤销。完整user row长期缓存，还包含password/salt；logout的userContext.getToken还会再次验证middleware已验证的JWT。二次验证是当前执行顺序，合并时须保护旧失败时点。
- **影响/测试**：login-session保护顺序登录/正确logout/unknown token、原TTL选项；前一设置批次 Worker 合同还保护个人注销撤销，但管理物删不同。没有并发login/logout/refresh、跨日或管理物删会话测试。线上传播/过期实况**未确认**。
- **收益/风险**：先集中SessionStore并保存当前行为；再独立确定撤销/TTL/强一致性需求及持久化方案。收益高，结构风险中，生命周期/存储改造风险高；clone对象或模块级锁不能单独证明跨实例修复。

### D09 · P2 · 手工授权清单、宽Context与局部语言遗漏

- **位置/职责**：[security.ts:11](D:/MailServer/cloud-mail/mail-worker/src/security/security.ts:11) exclude/requirePerms/premKey，95–175 middleware；user-context；types/context；turnstile-service.ts:3/12/19。
- **问题**：路由注册与三份prefix清单分离，不绑定method，新增路由缺少声明时默认只需登录。middleware兼做DB metadata更新、会话刷新和授权；一些用例仍要求整个HttpContext，以req/get/set隐式传播身份/语言/缓存。Turnstile虽收到req仍用全局默认t：上次全量审计的真实service实验中，英文缺token/失败返回中文；本批未改该区域；全局语言竞态已修，不能重新报它。
- **依赖/消费者**：security→JWT/sessionFields/user/perm/i18n；app装配；所有API。Turnstile→reader/gateway，被login/account消费。
- **影响/测试**：路由集合、401/403/public、fixed translator交错已覆盖；不存在全部65路由的method+权限矩阵，Turnstile合同仅code/副作用，没英文译文。某些无特定perm路由可能是设计，是否要收紧**未确认**。
- **收益/风险**：集中现有权限元数据及路由覆盖断言，业务用例逐步接受身份/metadata/translator能力；Turnstile语言修复独立小批。收益中高，结构风险中；改prefix精确匹配或新增权限是行为变更。

### D10 · P2 · settings对象、持久格式与响应视图混合

- **位置/职责**：[settings-reader.ts:26](D:/MailServer/cloud-mail/mail-worker/src/service/settings-reader.ts:26) query、settingService.refresh:39–45/get:48–85/setBlacklist:166–171/websiteConfig:173–213；types/settings.ts:12–24。
- **问题**：refresh把raw row放Context，query立即返回，prefix仍CSV且无domainList；KV读取才派生。get在同一对象上遮罩密钥并附请求展示字段，后续内部读取可能得到view值。宽SettingsCache和对象级断言不能保证历史scalar符合静态数字字段。env.domain在reader解析JSON，注册/管理/账户直接includes，字符串情况下语义不同。
- **依赖/消费者**：D1/KV、verify/userContext/r2、reader；配置API与所有收发、OAuth、角色/创建、存储。没有证据表明脱敏对象写回全局KV。
- **影响/测试**：当前 db-settings 还保护 env-only 重读、raw cache 早返回、缺设置/非法字段失败顺序、get 等待读取成功后才查验证、真实 storageType 复用遮罩对象、refresh 在 KV put 前发布、背景删除/替换顺序；account-user-settings 合同保护管理/公开响应。保护比上次增强，但 get 后真实业务消费者、反复遮罩和字符串 domain 全入口决策矩阵仍缺。类型/clone/归一化会触碰现有 identity 合同，不能仅靠测试数量认定 B7 已安全完成。
- **收益/风险**：定义raw/cache/read view/admin/public各职责，先提取纯投影而保持现有返回，再独立决定消除mutation/归一化。收益高，风险中高；禁止一批顺手改0/1/2、空值/遮罩/留空语义。

### D11 · P1/P2 · HTTP DTO只静态声明，实体和响应仍渗透

- **位置/职责**：[api/user-api.ts:20](D:/MailServer/cloud-mail/mail-worker/src/api/user-api.ts:20)、email-api:31/36、role-api:11/21、setting-api:9、star-api:9 的req.json泛型；types/admin RoleInput/SettingsPatch继承insert形态；userService.list:145–238/setStatus:275–286。
- **问题/本地复现**：req.json<T>不会校验实际body。status:'1'由真实SQLite保存为1，却跳过严格比较的KV撤销（kvDeletes=[]）。user/list历史凭据输出已由本包修复；同user两OAuth行仍可占重复分页位置，list长度2、total=1的现状有本包回归记录。分页只设最大值，负size或star缺size会在当前Drizzle dialect省略LIMIT。role重复验证/CSV转换、name查询结果被覆盖还增加无效查询。
- **本包已关闭的子项**：user-api:29–31仍调用原list；list显式选择15个用户列和5个OAuth列，不查询password/salt，再补六计数和sendAction。UserListItem/Page使用固定Pick；admin和仅user:query委托响应均无两字段/秘密值，DB凭据和真实登录保持。原先是凭据散列材料输出，不是匿名/明文密码泄露。字符串status的旧实验未重跑，仅核实未改源码，不合并处理。
- **依赖/消费者**：API→相应Service→entity/ORM/DAO；React管理员/邮件/设置消费者。外部响应应独立白名单，不应直接等于DB row。
- **影响/测试**：db-types验证既有编译期契约；user/list现有明确DTO、15项Node及7项Worker保护安全字段与原行为。mail-query基线已覆盖个人/星标分页、size/coercion原行为与HTTP shape，但不构成runtime validation；malformed body/枚举/日期、字符串status撤销仍待独立覆盖/修复。
- **收益/风险**：先拆输入/持久/响应转换，补负例；新拒绝规则和安全字段移除逐端点明确。收益高；全面验证风险中高，小型字段/归属修复风险中。不能通过新增TS断言获得runtime安全。

- **继承的类型精度（本轮复核源码，旧内存实验未重跑）**：[email-list-text.ts:10](D:/MailServer/cloud-mail/mail-worker/src/lib/email-list-text.ts:10) 的applyBriefListText仍声明T[]返回值，运行时却删除text/content。纯内存虚拟文件与当前全部project roots编译为0诊断：传入必填text:string后仍允许读取result[0].text.toUpperCase()；运行时已无该字段。签名沿用旧成员，是未消除的类型债；当前3个生产调用均丢弃返回值，未确认本批导致实际调用崩溃。应与现有DTO/Entity精度问题一起处理，不顺便扩大B2-B。

### D12 · P1/P2 · 写命令、额度和缓存发布缺一致性边界

- **位置/职责**：[role-service.ts:100](D:/MailServer/cloud-mail/mail-worker/src/service/role-service.ts:100) 更新role→删权限→插权限，128–131删除，149–150默认角色；verify-record-service:59–89；regKey.reduceCount:90–95；login.register:140–148；accountService.setAllReceive:247–248；settingService.set:90–117/refresh:39–45；setBackground:138–162。
- **问题**：角色多写会留下半结果；验证码SELECT→INSERT无(ip,type)唯一约束；注册码check后无余额条件扣减；注册和OAuth绑定跨多步写。账户allReceive先全清再更新目标，有中断/交错窗口。settings从旧KV合并tokens，即使patch没tokens也重写，并发可能覆盖；D1成功后KV失败，响应失败但持久化已改。背景先删旧对象，解析/上传新对象失败会失去旧资源。setting单行由约定保障，UPDATE无WHERE。
- **依赖/消费者**：role/perm/user/account/oauth/verify/regKey/setting实体和D1/KV/对象；管理、注册/OAuth、账号、发件、所有配置读路径。
- **影响/测试**：顺序角色SQL/NULL、额度、正确计数返回、settings merge已有；前一设置批次补了 refresh 的延迟/失败 KV 发布及 URL 背景替换顺序，但这些是现状特征，不证明跨资源回滚。中途写失败回滚、并发最后额度/首计数、重复setting行、背景新资源准备失败仍缺。实际重复历史数据**未确认**。
- **收益/风险**：按不变量分别制定原子命令/条件更新/结果检查/缓存恢复；现有public批量创建已经用D1.batch，不能泛称全库无batch。收益高、风险高；唯一约束/版本表等DDL必须有独立数据盘点与升级/恢复方案。

### D13 · P1/P2 · 历史init是DDL、回填、种子和配置改写的单一执行器

- **位置/职责**：[init/init.ts:16](D:/MailServer/cloud-mail/mail-worker/src/init/init.ts:16) 全历史重放；v3_3DB:42–63、v3_2DB:65–109、v3_0DB:120–141组batch/catch；v1_1DB:462–603、intDB:605–700；receiveEmailToRecipient:702–721、initAccountName:725–744。
- **问题**：已有某列可使一组ADD COLUMN失败，catch把真实错误同“已升级”一起跳过；索引组同样缺精确分类。v2_9DB:143–148反复改auto_refresh；v1_6DB:295/308改域名/公告。全表回填生成大量更新并DROP旧列，没有持久升级状态/检查点。750行主要DDL，真正债务是不可诊断/不可恢复和职责混合，不是文件长度。
- **依赖/消费者**：只有init-api直接调用，内部D1、setting.refresh、邮件工具/常量与errorMessage/requiredRow兼容处理。影响schema、数据、配置/权限种子及启动可用性。Drizzle $type仅改善静态表达，builder与历史DDL默认/nullability差异仍须共同读取。
- **测试**：fresh、完整repeat、完整v3.2→v3.3/schema/代表数据已有；repeat只保护选定title/rows/schema，不保护所有历史变换；单列半升级、真实错误/缺索引/大表回填/恢复无覆盖。缺setting列最终refresh可能报502，不能称所有半升级都“成功”。
- **收益/风险**：先加升级后置条件/失败fixture，再分registry、schema step、一次性backfill、seed，最后决定版本化。收益高、风险高。普通CI自动init已禁止，不应重复报告为现存问题；保留GET入口/secret协议直到独立设计批准。

### D14 · P2 · scheduled任务与统计缓存没有独立故障/时间边界

- **位置/职责**：[index.ts:29](D:/MailServer/cloud-mail/mail-worker/src/index.ts:29) 串行任务；analysisService.refreshEchartsCache:37–44/queryEcharts:47–108；analysisDao:52–108；autoClean:515–565；oauthDao.clearNoBindOathUser:13–15。
- **问题**：统计只列KV第一页，无cursor；所有key Promise.all无预算，一项失败阻止后续OAuth清理；缓存无TTL/明确响应decoder。清理长while无检查点；日重置看实际Date而非scheduledTime；未绑定OAuth每小时全删，可能与900秒setup窗口冲突。三份15天SQL重复；固定当日offset对整个窗口使用，DST误分桶是源码推导，**本轮未复现**。
- **依赖/消费者**：index→verify/user/email/analysis/oauth；analysis→D1/KV/dayjs。HTTP图表也调用相同查询/cache。
- **影响/测试**：hourly/半小时分支、旧SAVING行为、autoClean排除/近期保护、固定offset SQL已有；半小时测试analysis_cache=false，不能称已覆盖启用缓存。分页keys、多key故障、后续任务、UTC日界、setup在清理期间、DST无专属验证。
- **收益/风险**：先补时间/cache故障测试、命名独立任务与结果，再分别分页/预算/时间规则。风险中高；Promise.all全部任务会改变原顺序，不能作为默认重构。

### D15 · P2 · 通知交付与Telegram查看混在服务里

- **位置/职责**：[telegram-service.ts:22](D:/MailServer/cloud-mail/mail-worker/src/service/telegram-service.ts:22) JWT/D1/HTML查看与52–103推送；webhookService.sendEmail:9–65组织DTO/URL/headers/重试/fetch。
- **问题**：查看与外部通知修改理由不同；webhook retry仅处理NaN/负数，无有限值/上限/间隔/显式timeout，失败只日志，全部await于邮件事件。gateway已隔离的SDK不再直接渗透，但TG/webhook协议、预算及结果仍与业务混合。无需为只有一个简单调用的小模块强造空gateway。
- **依赖/消费者**：Telegram→ORM/settings/JWT/template/domain；webhook→domain；入站消费，Telegram API消费viewer。
- **影响/测试**：TG503/每chat payload、webhook503重试及“不丢已收邮件”有保护；巨大retry/timeout/partial forward/交付记录无覆盖。
- **收益/风险**：拆viewer/notifier，用例显式必需/可降级结果，有限预算独立改行为。收益中，风险中；是否需要队列取决于未确认的吞吐/恢复需求。

### D16 · P2 · 错误类型与外部适配仍依赖运行时字符串

- **位置/职责**：[error/hono-error-handler.ts:5](D:/MailServer/cloud-mail/mail-worker/src/error/hono-error-handler.ts:5) handleError；BizError:3–8；result:4–10；required-row/string-list及webhook自行catch。
- **问题**：JS TypeError读get/put/prepare的文本被当成绑定诊断，可能误分类；未知err.message/code直接进入响应。LegacyFailure.code:unknown诚实保留第三方旧值，尚无稳定内部错误分类。requiredRow在原读点模拟TypeError是兼容机制，不可直接当死hack删。
- **依赖/消费者**：createHono/onError、所有抛错Service，API result包装；非HTTP事件及对象流有不同错误传播。
- **影响/测试**：legacy-http保护HTTP200、falsy→null、payload码/缺binding/缺列；不能随拆分切400/500或给text/HTML/stream套JSON。平台不同错误文案、无message的throw没有完整保护。
- **收益/风险**：内部错误分类+旧HTTP adapter，先保持映射/输出；详细内部诊断是否隐藏是独立安全决策。收益中，风险中高。

### D17 · P3 · 确认无消费者的alias及可退出的facade仍在

- **位置/职责**：userService.selectByEmail:74、incrUserSendCount:309、updateAllUserType:311、listByRegKeyId:389；accountService.insertList:188；loginService.registerVerify:160–162为空；oauthService.deleteByUserId/deleteByUserIds:155–156；oauthDao.deleteByUserId:7–9；roleService.selectByName:192–194；types/attachment.PreparedAttachment:39起；types/env.Env:18。
- **证据**：生产src引用已分别转为userDao、oauthDao批量方法；搜索源码/测试没有这些Service成员调用或上述类型使用。db-reg-key.test.mjs:9还mock旧userService.listByRegKeyId，但被测实现已经走DAO。无用alias不是完整service对象可删的证据。
- **依赖/消费者**：这些成员指向DAO或查询ORM；当前生产成员消费者为0，相关模块本身仍有大量消费者。完整Service移除会破坏真实用例。
- **影响/测试**：精确DAO SQL/params已有db-bindings/DB测试；删旧mock应验证fixture没有隐含作用。低风险减少误导；Env/PreparedAttachment只是小型类型收尾，收益低，不应凌驾核心边界工作。
- **需先改调用方的alias**：emailService.selectById/selectUserEmailCountList/restoreByUserId；attService.list/selectByEmailIds/selectOneByKeys；oauthService.clearNoBindOathUser。详细消费者见第6节。结构风险低，保持SQL/返回/绑定this/错误时点。

### D18 · P2/P3 · 验证工具的迁移收尾和契约覆盖仍不完整

- **位置/职责**：[mail-react/scripts/compat-audit.mjs:111](D:/MailServer/cloud-mail/mail-react/scripts/compat-audit.mjs:111) 读取已删除setting-service.js、:160读setting.js并按源码字符串截取；Worker check-frontend-contracts.mjs、test/helpers/worker-harness.mjs:17–34；package scripts/部署hook。
- **问题**：原audit:compat未适配TS，这是计划未完成项；本轮只静态检查，**未运行这个会重写报告的命令**。Worker check:compat仅查57 URL/method，不能证明body/response/header全兼容。harness sourcePath仍带JS fallback，直接node --test可用esbuild源码fallback；正规test:worker已锁定实际Wrangler产物，两种执行方式证明力不同。
- **依赖/消费者**：前端旧审计脚本/生成报告消费者、Worker CI/verify/test；baseline冻结工具也有历史JS用途。不是生产双入口。
- **影响/测试**：run-worker-contracts显式artifact access防错；loader有缺extension/重复JS-TS/隔离测试。当前84 Worker含按限制单独编译生产callback的测试，不应声称每条callback均来自同一Wrangler artifact。最重要负例见各项；生产凭据联调未确认。
- **收益/风险**：单独工具批修AST兼容、区分artifact与callback验证、清理不再需要的fallback，保留冻结baseline目的。风险低中；不得自动重录fixture使测试通过。本轮不修改前端工具/生成报告。

## 5. 已确认的安全/行为缺陷：必须与纯结构批次分离

以下问题对应区域仍有原执行逻辑，本批没有修复安全/数据行为，也没有修改OAuth、login/account/user；此前设置批次在这些模块仅替换读取依赖。已经在 D05/D06/D08/D11/D12 写明的缺陷不重复计数。先前本地诊断不冒充本次重新复现实验，生产实际利用均未确认；安全批次的紧迫性不会因结构批次完成而降低。

| ID / 优先级 | 当前函数、文件证据与依赖/消费者 | 具体风险、影响与现有保护 | 收益 / 改造风险 |
| --- | --- | --- | --- |
| S01 / P1 | emailService.send:171 → emailDao.selectById:11–15，只查emailId/isDel；attService.toImageUrlHtml:112 → attDao.selectOneByKeys全库key；消费者POST email/send | 回复没有userId范围，可将别人messageId放入reply headers；正文旧对象缺引用归属。现测试拒绝他人发送账户，不覆盖“自己账户+他人原邮件/key”。未确认生产使用情况 | 增加资源范围负例并独立修所有权；收益高，风险中；公开对象能力政策另定 |
| S02 / P1 | publicService.addUser:148–162 原始SQL插入email/UA/IP，verify-utils.ts:3允许apostrophe；由public-api/security public token消费 | 合法字符破坏SQL/作为表达式解释；需要public token，不能夸大任意匿名改库。现public合同只区分认证模式，未测建用户边界。此路径已有D1.batch，问题是参数化 | bind所有值且验证正常字符/原SQL语义；收益高，风险中 |
| S03 / P1 | src/service/user-service.ts 的setPwd:268–272/setStatus:275/physicsDelete:95仅目标ID；security:156只保护操作者admin；user-api:54–55→accountService.physicsDelete:235–239 | 委托相关user权限可操作admin目标；管理主邮箱删除缺个人delete:156–170的等价保护。需要相应权限，不能称任何用户都能接管。现无管理员目标/主邮箱不变量合同 | 目标策略集中后单独修权限；收益高，风险中，需明确委托管理能力 |
| S04 / P1 | account.add:67–73有base归属；login.register:48/141–143、user.add:351/355、public.addUser:148–152未应用；入站exact-plus优先 | 注册/管理/public可创建他人base+tag exact账户，影响后续该tag归属。已有plus exact/base健康合同，无跨创建入口占用负例 | 共享地址占用策略，独立评审兼容的合法alias；收益高，风险中 |
| S05 / P1 | resend-api:7–13直接json→resendService.webhooks:9起→emailDao状态；security放行/webhooks | 未验来源/raw body签名；已知有效resendEmailId可伪造事件；未知事件回SENT、旧事件可覆盖终态。未验证签名设置/生产事件乱序；现只测正常回调和错误文本 | 来源认证、事件幂等/状态顺序分别小批；收益高，风险中高，需要服务端签名配置 |
| S06 / P1 | telegramService.getEmailContent:39–43→template/email-text.ts:32直接插text；email-html.ts:7只删script、59/102写innerHTML；TG/API消费 | 内容净化边界不足，同源可执行属性/危险URL仍在。JSON编码解决外层脚本字符串，不解决HTML净化。未运行浏览器攻击。bot email-msg已转义<>，不能说该bot文本仍原样注入 | 独立展示净化/隔离回归；收益高，风险中，保护正常邮件格式 |
| S07 / P2 | telegramService:59 JWT无purpose/exp、api/telegram-api:8 public一周缓存；crypto-utils:密码SHA256与Math.random生成初始密码；普通会话见D08 | 查看URL泄漏后缺过期/撤销；密码工作因子/登录节流政策未完善。普通登录JWT不含emailId，现合同拒绝用普通session查看，不能称它可任意伪造邮件token。线上泄漏/撞库未确认 | 凭证用途/生命周期、密码渐进升级各自设计；收益高，风险高，不随TS重构改哈希/JWT/cookie |
| S08 / P2 | src/service/account-service.ts 的allAccount:229–230、setAsTop:251–257；user-api:49–50与account-api:33–34消费，依赖userDao/account查询及ORM | allAccount的list排除主邮箱，total含主邮箱，分页集合不同；置顶先递增自己主邮箱sort再owner-scoped更新目标，即使目标不存在/属他人也有副作用。源码确认，产品是否有意计入主邮箱/允许这种更新未确认；当前无该分页/负例合同 | 补契约并明确政策，独立修集合/目标校验；收益中，风险中 |

D11的用户列表password/salt输出已关闭；同时保留重复join与字符串status撤销、D08的管理物删撤销和并发、D05的邮件字节/发件后失败、D12的额度/计数等独立修复项。

## 6. 半成品与迁移临时结构的退出条件

### 6.1 已提取但旧模块仍有真实职责

| 现状 | 审计判断 | 下一步边界 |
| --- | --- | --- |
| mailSender、个人/全站查询和纯装配已独立，emailService仍627行 | 读取包已闭合；send/站内/清理仍有真实业务 | 不将旧service当facade删除，不自动进入其他批次 |
| 7DAO已独立，多个Service继续直接SQL | 去环是真改进；role/权限查询、复杂列表/删除仍混合 | 仅提取复用/复杂查询或原子命令，不要求每表Repository |
| settingsReader 独立且全部只读调用方退出 writer，旧 query 已删 | **本批闭合**，不再存在该半成品；reader 无 writer/storage 反向依赖 | writer 的 refresh/get/set、raw/cache/view mutation 仍有真实职责和独立债务，见 D10/D12 |
| gateway已隔离OAuth/AI/Turnstile/S3 | 有独立协议/响应处理，不是纯搬家 | TG/viewer、通知预算、storage对象/配置边界另拆 |
| 业务源码已完成TS迁移；user/list已使用显式投影与DTO | 附件阶段对象/内部SessionUser及其他端点仍有宽类型，部分历史scalar实际值比声明更宽 | runtime decoder/DTO视图另批；类型数量不等于边界质量 |
| 两级Hono factory、默认app、两类对象URL | 明确组合/兼容功能，未确认冗余实现 | 保留；不得为收尾机械删除 |

### 6.2 可以删除或迁走的成员

本轮重新检索了源码/测试、别名、this及动态成员访问。下表第一组确实无成员消费者，可独立清理；第二组仍需先改调用方并保留SQL/顺序/this语义。无用成员不代表整个Service无用。

| 入口 | 当前消费者/替代 | 动作 |
| --- | --- | --- |
| userService.selectByEmail/incrUserSendCount/updateAllUserType/listByRegKeyId | 生产成员消费者为0；真实查询与写入已走userDao | 删除4 alias及无效旧mock |
| accountService.insertList、loginService.registerVerify | 生产/测试未见调用；accountDao.insertList 唯一引用就是该 alias；后者为空 async 方法 | 可以一起删除两个无用入口及 accountDao.insertList；不影响 add 使用中的 countUserAccount |
| oauthService.deleteByUserId/deleteByUserIds | 生产为0；user删除走oauthDao批量方法 | 删除alias；再删无消费oauthDao.deleteByUserId单用户wrapper |
| roleService.selectByName | 生产/测试未见调用；public按roleList内存查找 | 可删；不要删其他有用查询 |
| PreparedAttachment、Env类型别名 | 目前未见使用 | 低优先级类型收尾 |
| emailService.selectById | send内部this调用（现第171行） | 本批保留，发送消费者调整后才可删alias |
| emailService.selectUserEmailCountList/restoreByUserId | userService:187–190/383 | 改叶子DAO消费，再删alias |
| attService.list | email-api:26 | 改scoped查询入口，仍保留userId过滤 |
| attService.selectByEmailIds/selectOneByKeys | 前者仅发送回读（email-service:274），后者为正文图片内部this调用 | 本批查询/星标已直连attDao；剩余入口仍有消费者，不误删 |
| oauthService.clearNoBindOathUser | index.scheduled | 改oauthDao/明确maintenance入口后可删转发 |
| harness.sourcePath 的 JS fallback | capture-contract-baseline 明确读取并要求原 JS；当前正规 Worker 合同锁定新 TS bundle | 非生产兼容层，仍有历史证据用途；只能与 baseline 捕获/回放策略同批决定，当前不是确认可直接删除项 |

已退出的settingService.query、B2-A六个emailService读取/装配成员及B2-B三个全站成员不再列入待删清单。当前没有证据支持删除整个 setting/email/att Service 或把全部 compatibility bridge 一并清理。

### 6.3 当前不可作为“临时hack”直接删除的代码

- boundId/boundIds：WHERE中string/null/undefined原参数语义、空列表SQL；不能用Number转换或无条件搬入INSERT。
- 附件insertId/缺省key处理、复制NULL自增ID、entity $type：当前SQL/default/mapper兼容，有精确测试。
- requiredRow/stringList：原缺行/非法历史字段首次失败的位置与旧错误文本；可以以后换内部错误，但会改变契约。
- mailSender/R2 metadata少数vendor assertions：保护历史nullable/畸形token边界，实际SDK/native emulator已有合同；不等于as any绕类型。
- jsonProperty/setJsonProperty/profileValues/spreadTokens/maskTokens：对历史JSON形态、属性mutation、SQL编码/对象spread提供实际兼容，不因“TS已完”就可删。若收紧输入，独立列行为差异。
- s3Service/aiService/turnstileService：分别有配置读取、业务过滤/降级、业务错误，当前有存在理由；不因短而删。
- 旧/mail/attachments、plus base回退、正文{{domain}}、OAuth setup证明、绑定恢复脚本：生产/持久化契约。
- 忽略目录的原JS bundle及frozen fixtures：历史比较证据，不参与生产双实现；不可为通过测试自动重录。

## 7. 模块依赖与处理优先顺序

关键fan-in和高耦合面由当前静态图确认：

| 模块 | 直接生产消费者 | 拆分价值 |
| --- | --- | --- |
| mail-query-service | email API（1） | 两个个人读取入口可独立理解/测试，不加载写入业务依赖 |
| all-mail-query-service | all-email API（1） | 两个全站读取入口与私有过滤器，仅D1读取与无IO装配，不持有认证/配置/写入能力 |
| starService | star API（1） | 附件读取直连DAO，装配不再经写入/存储Service |
| emailService | email/all-email API、入站、index、accountService、userService（6） | 仍有写入/维护职责，模块消费者计数未下降 |
| userService | my/user API、入站、index、security、login（6） | 登录/管理/事件与会话同时依赖 |
| accountService | account/user API、入站、login/user（5） | 用户/邮箱/邮件删除跨域 |
| settingsReader | 入站、account/att/email/login/oauth/r2/s3/setting/telegram/turnstile/user（12） | 稳定读取叶子；fan-in 增加没有伴随职责增加，仍需保护缓存协议 |
| settingService | setting API、init（2） | 只读调用退出已完成；下一问题是 raw/cache/admin/public 视图边界 |
| ORM | 6DAO +16Service（22） | 先抽复杂/复用查询和原子命令；不机械搬全部SQL |
| init | init API（1） | fan-in低但数据风险高，不按文件长度提前重写 |

**S-USER-LIST已执行并关闭。** 凭据输出已由明确投影和安全合同修复，不再列为下一待办；没有因此进入SessionStore、附件或其他批次。其余风险保留审计证据，本轮不重新规划整个项目，也不自动给出下一包。

旧候选依赖图仅作审计索引，不是执行顺序或授权；文件长度、低收益alias和主观分层不构成继续重构的理由。

~~~text
B0 当前目标的 characterization/契约门槛
 ├─ 已完成：设置只读依赖退出/query facade 删除
 ├─ 已完成：B2-A 个人查询/共用装配
 ├─ 已完成：B2-B 全站读取隔离
 ├─ 已完成：S-USER-LIST 列表安全投影/DTO
 ├─ B1 剩余死 alias 未处理，仍可独立收尾
 ├─ B3 附件阶段计划 → B4 发送/站内编排
 │                → B5 接收/通知编排
 ├─ B6 SessionStore结构 → 独立会话生命周期/一致性修复
 ├─ B7 配置视图 → B8 操作内storage配置/HTTP policy
 ├─ B9 管理/onboarding政策与DAO命令 → 独立原子写/额度修复
 └─ B10 维护/统计 → B11 历史升级执行器

工具收尾 B12 独立进行；不阻塞业务正常运行。
S01…S07及D05/D06/D08/D11/D12缺陷各有目标小批，不隐藏在结构移动中。
~~~

图保留候选依赖关系，不是执行授权或自动顺序。B2-A/B2-B/S-USER-LIST均已闭合；其他候选没有实施，也未重新制定全项目计划。

## 8. 建议重构批次：独立完成、验证与回滚

共同门槛 G（在仓库根执行）：

~~~powershell
pnpm -C mail-worker run build
pnpm -C mail-worker run verify
git diff --check
~~~

build更新assets并打包；verify 有 types/typecheck/lint/source/compat/149 Node 和 84 当前 Worker 测试。每个源码批次退出时均跑G和新增关联测试，不自动deploy/init。局部快速unit可用node --test指定现有文件；正式Worker合同使用test:worker的明确Wrangler artifact，避免把源码fallback当部署产物证明。

以下保留原候选编号与实际状态；B2-A历史见8.1，B2-B完成证据见8.2。编号不是当前优先顺序；本轮只完成8.3的S-USER-LIST，其余行不代表重新规划、批准或实施。

| 批次 / 当前状态 | 范围与文件 | 完成标准、独立验证 | 风险 / 回滚单位 |
| --- | --- | --- | --- |
| B0 / 先行 | 对应test/unit/contracts补最小诊断与正常边界：user/list的剩余边界、字符串status、reply跨用户、分页、并发session、关键失败注入 | 正常合同不改；通过的诊断用例明确标出当前缺陷，不将其固化为永久约束。要求修复后行为的负例与对应小修同批交付，不能先合入红CI等待未来批；退出仍满足G | 低；诊断测试包独立回滚，目标测试/修复成对回滚，frozen fixture不重录 |
| B1 / 读取部分已完成，其他 P3 收尾 | 设置只读消费→reader/query删除已闭合；剩余 D17 无用成员和其他 DAO alias | 当前已完成部分 G 通过；剩余删除仍需引用证据及相关 SQL/fixture 检查，不阻塞 B2-A | 低；每组 caller+alias+mock 同包回滚，无 DB 变化 |
| **B2-A / 已完成** | 个人读取独立、共用摘要/附件关联、星标直连attDao；全站SQL原位 | 先补19项基线再分步重构；118 Node/72 Worker与build/静态门槛通过；旧六成员删除，无新增环/写入依赖 | 本包API/查询/装配/测试/文档一起恢复开始快照，无schema/key/index/URL变化 |
| **B2-B / 已完成** | all-mail-query-service两个导出/私有过滤器；all-email API两个GET直连 | 先补16 Node+5 Worker基线，旧实现和新实现完整build/verify均134/77通过；旧3成员和4专用import删除；个人/星标及16非目标成员不变 | 中低；读取实现+API调用+测试/文档同包回滚，无schema/key/配置变化 |
| B3 / 3 | types/attachment、att.toImageUrlHtml/save*、imgReplace、mailSender转换 | 阶段输入输出可独立理解；DOM准备与IO分开；保留CID共享身份/first-match/key/SQL；G+db-bindings/mail-storage-edge；补偏移bytes/MIME/data URL | 中高；转换+types+caller+测试原子回滚；不改已存key |
| B4 / 4 | emailService.send/HandleOnSiteEmail → 有实际实现的发送/站内模块 | API只调用use-case；旧facade无真实复杂业务或已退出；保持provider优先/mixed/reply和原副作用顺序；G+mail-send/storage；补站内拒收/部分失败 | 中高；use-case/facade/provider caller一起回滚；已发邮件不可撤回。D05的顺序修复另外提交 |
| B5 / 5 | email/email、策略/持久化计划、Telegram viewer/notifier、webhook通知 | 事件入口薄，必需/降级边界明确；拒收/accepted/附件/通知顺序保持；G+mail-inbound/integrations/mail-storage-edge；补forward失败 | 中；handler与提取模块一起回滚；raw/恢复/通知预算改变另批 |
| B6 / 可与B2并行 | login/security/user中的会话KV/JWT、types/auth/user-context | 一处SessionStore操作协议，caller不自己拼写key/数组；先保持tokens/11边界/TTL/metadata时点；G+login-session/http-auth/OAuth，补barrier并发 | 中；所有session caller与store同批回滚。强一致性/TTL/撤销策略另批，不能靠纯结构关闭D08 |
| B7 / 配置视图候选，读取退出已完成 | settings-reader、settingService、types/settings、纯配置/管理响应转换 | raw/cache/view/patch职责明确，旧scalar/empty/mask语义有迁移适配；第一批不改变identity；G+db-settings；补get后内部读取/domain矩阵 | 中高；reader/view/所有caller+tests整组回滚；D1/KV版本策略另批 |
| B8 / 次于B7 | r2/s3/kv、types/attachment、OSS/根对象适配 | 每操作配置明确，业务不猜Response/R2形态；两种HTTP policy保留；G+storage/integrations/mail-storage-edge；新增KV/S3 OSS/not-found/配置读取测试 | 中；所有存储caller/adapter整组回滚；不改backend归属/key或自动搬历史对象 |
| **S-USER-LIST / 已完成** | 显式列表投影与types/user响应；专属unit/Worker合同 | 先14+6非凭证基线，安全负例旧红新绿；阶段B149/84及build通过；仅移除两字段 | 无DDL/数据迁移；两源码/两测试/两文档按本包快照回滚，回退会恢复外泄 |
| B9 / 独立管理流候选 | role/perm/user查询、onboarding纯政策/表单转换、相关DAO/DTO | 复用域名/身份查询、请求/row/响应分离；不机械覆盖各入口既有差异；G+DB-admin/reg-key/verify/http/OAuth；补管理命令/政策表驱动测试 | 中；每种命令/政策小批回滚。原子role/verify/regKey/settings/BG分别独立修复，不同不变量不合包 |
| B10 / 后续独立 | index scheduled、analysis-service/dao、email维护、OAuth清理 | 任务边界/时钟/缓存协议明确；先保留原串行与错误传播；G+scheduled/db-analysis；新增enabled cache、分页、故障、UTC/DST/setup窗口 | 中高；单任务+调度caller一起回滚；顺序/继续执行/时区规则改变独立评审 |
| B11 / 最后的数据高风险批 | init执行器/历史step/回填/种子，entity与fixture只作对照 | 先有partial/失败/数据变换postcondition测试，再提取有序registry；不自动改DDL/default；G+baseline-init/db-schema/新增升级故障nativeD1 | 高；先纯组织回滚；真正DDL/回填必须备份/版本/恢复专案，git revert不恢复数据 |
| B12 / 独立工具收尾 | 旧compat-audit、Worker contract artifact/JS fallback策略、失效mock/小型类型alias、文档 | TS AST与当前结构兼容、只读契约检查和报告生成分开；清楚标注artifact/callback；G+module-loader/deploy tests，不重录baseline | 低中；工具/测试/文档单包回滚，生产无需等此批 |

### 缺陷修复的独立批次示例

一次只解决一个不变量，避免把它们塞进B4/B6/B9：

1. user/list安全响应白名单已完成；一对多查询分页、reply资源归属、负分页、字符串status撤销仍分别成批。
2. public参数化SQL、管理员目标/主邮箱策略、plus占用规则、Resend来源认证、Telegram展示安全分别成批。
3. raw字节输入、附件前置校验、发送幂等/receipt、入站阶段恢复、站内EMBED引用、对象回收分别成批。
4. SessionStore结构完成后，会话撤销/TTL政策和并发存储策略独立实施；新storage/schema/key须兼容旧数据并定义升级退出。
5. role原子写、verify首次计数、注册码预留、OAuth绑定唯一性/条件更新、settings缓存发布、背景先准备后切换各自有故障/并发测试。

这些批次可独立运行/验证；引入DDL的修复必须有自己恢复方案，不宣称全部都能仅代码回退。没有确认产品政策/生产旧数据的地方先标**未确认**，不能替用户默默改变能力。

### 8.1 B2-A 已完成边界及历史证据

~~~text
email-api → listPersonalMail/latestPersonalMail（mail-query-service）
  → accountDao / ORM → attDao → attachListAttachments
  → applyBriefListText 或 toListText → result.ok

star-api → starService（原SQL/add/cancel）→ attDao + 同一装配叶子
all-email-api → listAllMail/latestAllMail（all-mail-query-service）→ attDao + 同一装配叶子
~~~

- 两个个人读取函数位于[mail-query-service.ts:19](D:/MailServer/cloud-mail/mail-worker/src/service/mail-query-service.ts:19)与[:142](D:/MailServer/cloud-mail/mail-worker/src/service/mail-query-service.ts:142)，私有过滤器在:178，只有list/count使用；latest仍为独立查询。API直接调用，无旧方法转发。
- [email-list-text.ts:10](D:/MailServer/cloud-mail/mail-worker/src/lib/email-list-text.ts:10)负责brief mutation；[email-list-attachments.ts:4](D:/MailServer/cloud-mail/mail-worker/src/lib/email-list-attachments.ts:4)只接收结果行/附件行，不读Context、DB、配置或对象。
- 个人/全站/星标full列表保留正文和attList、不新增listText；brief增摘要并删除正文；latest同时保留正文/附件/摘要，不新增star字段。
- 保留list/count的软删账户join、无该join的latestEmail、无cursor的count、latest固定RECEIVE/降序20、原ID绑定、各自默认/size与缺账户失败时点；全站过滤和marker范围未改。
- 批量附件只筛ATT，不换成带userId/contentId IS NULL的attList查询。数组/行/附件身份、严格比较、重复行和顺序保留；个人/全站空列表跳过查询，星标full空集合仍读并传播错误。
- [test/unit/mail-query.test.mjs](D:/MailServer/cloud-mail/mail-worker/test/unit/mail-query.test.mjs)的12项基线保护coercion/size/过滤/SQL参数、正文/摘要、SQL先截断、并发/原错误、空集合及mutation；新查询模块测试不需要sender等mock。
- [test/contracts/mail-query.test.mjs](D:/MailServer/cloud-mail/mail-worker/test/contracts/mail-query.test.mjs)原7项Worker合同（当前文件另补B2-B五项）覆盖五个HTTP入口、前端brief/full/详情回查顺序、账户回退/marker、latest上限、星标/全站差异、附件故障、auth/CORS/Cookie/错误method。
- 所有基线先在旧实现通过；装配与查询阶段均完整build/verify通过。无新增Controller、接口族、万能query/Context、DI或兼容facade。
- attService.selectByEmailIds仍供发送回读，未删除。全站查询本体当时未改、现由B2-B独立完成；发送/站内、接收、维护/一致性与其他alias不在读取批次，没有借“收尾”扩大范围。

回滚单位是本包查询/装配/API/测试/文档。工作区已有未提交TS迁移，须恢复包开始快照或独立提交，不能整仓reset到HEAD；本包没有数据或资源迁移。

### 8.2 B2-B 全站读取窄包：已完成

- [all-mail-query-service.ts:15](D:/MailServer/cloud-mail/mail-worker/src/service/all-mail-query-service.ts:15)的listAllMail、:99的latestAllMail、:123的私有allMailFilters承担全站D1读取；[all-email-api.ts:9](D:/MailServer/cloud-mail/mail-worker/src/api/all-email-api.ts:9)/:24直接调用，无emailService转发。
- 新模块169物理行、9条本地运行时依赖，使用现有EnvContext，不读取req/get/set/user/setting，不引入可选scope、Controller/Repository/DI或新全局状态。attDao目前接受EnvContext，本包未扩改共享Context/DAO。
- 旧allList/allEmailLatest/allEmailListFilters与四条列表专用import退出。emailService为627行/21直接依赖，其他16成员和2helper不变；个人/星标源码、DAO/Entity/共享类型/装配叶子和配置未改。

**行为与基线**：

| 保护内容 | 当前证据 |
| --- | --- |
| 条件join/搜索/参数 | 新test/unit/all-mail-query.test.mjs的16项Node：count按userEmail条件join；NOCASE/前缀/双地址OR/LIKE wildcard；type/full/size coercion；list Number ID与latest raw/undefined绑定 |
| marker/游标/投影 | total无cursor；全局RECEIVE marker独立且零哨兵；latest降序20；deleted/noone/orphan范围；full/brief/latest正文/摘要/附件字段 |
| 失败/生命周期 | 三读barrier并发；list/count/marker各自异步拒绝保留error identity；全部成功后读附件，空集合跳过，附件错误原样传播 |
| HTTP/授权 | test/contracts/mail-query.test.mjs当前12项：原7项+新增5项。真实独立委托角色权限/撤权、跨用户与个人隔离；HEAD/OPTIONS、raw Authorization/Bearer/失效session、CORS/无Cookie；破坏email表时401/403先于查询；前端brief/full/detail及latest |
| 旧→新行为保持 | 所有新增测试先在旧实现跑绿；切换时仅替换Node入口并移除sender mock，fixture/16项测试体及预期完全相同；三个query body AST规范化相同，仅this过滤器调用变私有函数 |

**执行与回滚**：阶段A基线与阶段B切换后各完整build/verify，均134 Node+77 Worker，无skip/todo。无数据库、key、binding、环境变量、依赖或前端源码变化；没有bug修复。按本批开始快照/独立提交整体恢复三个生产路径、两测试路径、两文档即可；工作区既有未提交迁移不能整仓reset到HEAD。

**收益和限制**：emailService职责减少，直接边25→21；新查询可无writer/sender/存储mock独立测试，取消this receiver。全图边361→367、0环→0环，写入Service消费者仍6，未宣称总边数、fan-in、包体或生产性能下降。没有新旧实现或单行facade并存；已有DTO精度、负分页、收发/附件/会话/配置/安全一致性债务保留，不进入下一批。

### 8.3 S-USER-LIST 用户列表安全响应边界：已完成

**实际实现**：[user-service.ts:103](D:/MailServer/cloud-mail/mail-worker/src/service/user-service.ts:103)保留原参数/调用方，:145显式选择15个非凭据user字段+5个OAuth字段；await rows→await total→原七路Promise.all→:204 map生成六计数/sendAction。SQL和响应不再带password/salt；[types/user.ts:23](D:/MailServer/cloud-mail/mail-worker/src/types/user.ts:23)的UserListItem使用固定Pick及必填统计，UserListPage约束返回。没有新runtime目录/接口/Repository/通用sanitizer，也没有改全局result或user DAO。

**目标字段**：保留userId/email/type/status/createTime/activeTime/createIp/activeIp/os/browser/device/sort/sendCount/regKeyId/isDel、username/trustLevel/avatar/name/platform、六类计数及sendAction，共27键。仅移除原29键中的两凭据，连当前前端未用的sort/regKeyId/avatar/name也保留；nullable/历史scalar及sendAction字段存在性不变。

**先基线、再修复**：

| 阶段 | 已完成证据 |
| --- | --- |
| A：旧实现基线 | 新test/unit/user-list.test.mjs前14项与test/contracts/user-list.test.mjs前6项先绿，仅在测试内忽略两凭据比较其余27键；完整build/verify148 Node+83 Worker通过 |
| 安全目标旧红 | unit首条SELECT/返回键与HTTP admin/仅user:query两个身份均检测到两凭据；失败诊断仅报键名/布尔值，目标未改后重跑 |
| B：显式投影与DTO | 两生产文件修改后unit15+角色4+session7共26项通过，Worker专属7项通过；完整build/verify149 Node+84 Worker全绿，无skip/todo |
| 冻结与范围 | 原14项/6项测试、helpers和fixture前缀逐字符不变；其余20个userService成员保持；无API/前端/DAO/Entity/security/login/schema/config/依赖变化 |

**保护的行为**：

- list→total→七路并发保留；实际raw由role先启动再六统计，调用关系未改。空列表仍9查询，无早返回；分阶段SQL失败原样传播。
- 原参数Number/default/cap/isDel mutation、status原绑定、NOCASE/LIKE、排序/分页、OAuth一对多重复和user-only total保留，不顺手补validation/去重。
- 六类计数、SAVING排除、NOONE范围、zero fallback、strict角色匹配及管理员显示type=0保留；map只生成新的响应行，不写DB。
- admin与仅user:query委托可查原全站范围，401/403/撤权、HEAD/OPTIONS/POST现状、envelope/status/header/Cookie、OAuth空与profile全部保留。
- 数据库password/salt不变；真实原密码两次登录、错误密码拒绝、完整私有会话和旧token保持；跨日仍更新actor metadata/KV30天TTL，同日不重复刷新。没有把整个GET改为零写入，也未裁剪内部SessionUser。

**收益与限制**：Entity新增字段不会自动扩大此HTTP响应；必填DTO代替完整行+Partial，查询不再读取无必要凭据。runtime图仍114模块/367边/0环，userService仍6消费者、393物理行，未宣称大服务/总依赖/圈复杂度下降。没有新wrapper、双实现、God module、any或忽略注解；未发现本包新增实质债。

**回滚与停止**：本包仅两源码、两测试、AGENTS和本报告；无DDL/key/资源或数据迁移。按本包开始快照或独立提交一起恢复，不能整仓reset到HEAD；回退旧投影会恢复外泄，不能视为安全收尾。OAuth重复分页、字符串status撤销、会话/管理员目标/附件/发送等问题原样留给独立后续，不进入下一批。

## 9. 本轮验证与实际限制

| 验证 | 结果 | 证明范围 |
| --- | --- | --- |
| 阶段A build/verify | 通过：148 Node+83 Worker | 非凭证基线先在旧实现建立；types/typecheck/lint/source/compat、React assets与明确Wrangler产物 |
| 安全回归目标 | 旧实现按预期失败，新实现通过 | SQL不查询两列；admin/委托JSON无两字段及实际fixture凭据值 |
| 阶段B build/verify | 通过：149 Node+84 Worker，无skip/todo | 新投影、DTO、返回装配与全本地回归；不是生产联调 |
| 专属与关联测试 | unit15+角色4+session7共26通过；user-list HTTP7通过 | 字段/null/scalar/统计/角色/参数/OAuth/顺序、权限/HTTP/跨日/凭据和真实登录 |
| AST/图/范围 | 114模块/367边、0环/DAO反向边；20非目标成员原样，4改2增/374原文件不变 | 无额外runtime层/依赖或范围外源码，已有工作区和HEAD/分支保留 |
| git diff --check/文档链接 | 通过 | AGENTS记录真实投影/类型/测试/时序，审计仅关闭对应子项 |

没有重新安装依赖或升级工具（package/lock未改），未跑旧audit:compat、deploy或remote init。SQLite experimental/既有Vite大chunk提示未引发范围外修改。生产历史数据/实际访问记录、外部自定义客户端依赖、KV跨实例传播、真实SMTP/provider/云限额、浏览器攻击、UTC/DST及生产性能仍未确认；本地测试不替代这些证据。

## 10. 当前结论及停止点

S-USER-LIST已完成：/user/list现在只查询并返回明确允许字段，password/salt不进入列表SQL或响应。完整DB用户和私有会话保留，其他27键、权限/查询/分页/OAuth/统计/HTTP与登录行为通过冻结基线保护。

本包没有新增运行时模块、依赖、环或God module，也没有借安全修复扩大到整个userService。DTO边界与运行时投影共同生效；其余状态/分页/会话/收发/存储等债务仍在，不因全套通过而标完成。

本轮到此停止，不自行推荐、规划或实施下一批。

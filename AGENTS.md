# AGENTS.md

## Project Overview

本指南描述当前工作区的实际实现（2026-11-04 核对）。Worker 源码为严格 TypeScript；前端与 Worker 独立管理类型、依赖和构建。修改时仍以检出源码和真实调用链为准。

项目由 React 邮箱 SPA 和 Cloudflare Worker 组成，同一个 Worker 提供 API、静态前端、入站邮件事件及定时维护。当前已接入的能力包括密码注册/登录、第三方登录与首次邮箱绑定、多邮箱账户、收件/发件/星标/已读、附件与正文图片、浏览器本地草稿、用户/角色/注册码管理、系统设置、统计图表，以及可配置的入站邮件推送和清理。

根目录没有统一的 package.json 或共享源码包。`mail-react` 与 `mail-worker` 分别管理依赖和 pnpm lockfile，通过 HTTP 契约及构建产物耦合。当前前端是 `mail-react`；旧 `mail-vue` 仅存在于 Git 历史与兼容性文档中。

## Repository Structure

| 路径 | 实际职责及阅读入口 |
| --- | --- |
| `mail-react/src/main.tsx`、`src/app/App.tsx` | React 启动、QueryClient、BrowserRouter、主题同步、登录与页面权限守卫、懒加载业务页面 |
| `mail-react/src/pages/` | `LoginPage`、`OAuthCallbackPage`、`SetupAccountPage`：登录、注册、OAuth 回调和首次建邮箱 |
| `mail-react/src/layouts/AppLayout.tsx` | 导航、邮箱切换/维护、搜索入口、公告、退出、全局写信窗口 |
| `mail-react/src/features/` | `mail/MailPage.tsx`；`compose/` 写信和草稿；`settings/` 个人设置；`admin/` 用户/角色/注册码/系统设置/图表 |
| `mail-react/src/api/`、`src/types/index.ts` | 请求封装、按业务分组的 API、前端数据接口；与 Worker 实体没有自动生成关系 |
| `mail-react/src/stores/app.ts`、`src/i18n/`、`src/utils/mail.ts` | Zustand 全局状态、中英文资源、邮件地址/时间/对象 URL 辅助逻辑 |
| `mail-react/src/components/`、`src/styles.css` | 公共按钮、反馈状态、登录布局、TurnstileWidget；全局 CSS、主题变量和响应式规则 |
| `mail-react/src/utils/oauth.ts`、`src/utils/turnstile.ts` | OAuth 授权与专用回调校验；Turnstile SDK 单例加载、就绪检查与 widget 生命周期 |
| `mail-react/public/tinymce/` | 随仓库分发的 TinyMCE 7.9.1、插件、语言、皮肤及许可证；由 `RichEditor.tsx` 动态加载 |
| `mail-react/scripts/compat-audit.mjs` | 对照历史 Vue API 和当前动态配置；写出 `compat-api.generated.md` |
| `mail-worker/src/index.ts` | `fetch`、`email`、`scheduled` 三种 Worker 事件入口 |
| `mail-worker/src/hono/`、`src/security/`、`src/api/` | 显式 app factory/endpoint 注册；JWT/KV 会话与路由权限；API 负责 HTTP 适配 |
| `mail-worker/src/service/` | 个人/全站邮件读取分别在 mail-query-service / all-mail-query-service；email-service 保留收发、删除和维护；另有额度/权限规则、存储选择及 settings-reader 读取叶子 |
| `mail-worker/src/entity/`、`src/init/init.ts` | Drizzle 表映射、D1 ORM 工厂、建表及历史升级 SQL |
| `mail-worker/src/email/email.ts`、`src/lib/email-list-columns.ts` | 入站 MIME 处理链；完整/摘要邮件查询投影 |
| `mail-worker/src/dao/` | account/user/email/att/star/oauth 持久化叶子、analysis 聚合 SQL；不依赖 service 或 Hono app |
| `mail-worker/src/types/`、`worker-runtime.d.ts` | Env/Context、JWT/会话、请求/响应/领域与 Drizzle 推导类型；Wrangler 生成的运行时声明 |
| `mail-worker/src/integrations/`、`src/error/` | 原生/Resend 发信、OAuth/AI/Turnstile/S3 外部边界；BizError 与 HTTP 异常映射 |
| `mail-worker/src/const/`、`src/utils/`、`src/template/`、`src/i18n/` | 状态码/KV key、加密/邮件/日期工具、Telegram 展示模板、后端翻译 |
| `mail-worker/wrangler*.toml`、`scripts/`、`.github/workflows/deploy-cloudflare.yml` | 本地/部署配置、绑定恢复脚本、Node 回归测试、GitHub Actions 部署 |
| `doc/`、根目录与 `mail-react` 的 Markdown | 展示图片、迁移/兼容审计和运行说明；须与当前源码核对 |

表中子目录路径以对应的 `mail-react` 或 `mail-worker` 为基准。仓库未提供 Docker 配置、独立 SMTP/IMAP 服务或单独的共享类型项目。

## Architecture

### Frontend

- 实际使用 React 19、TypeScript、Vite、React Router、TanStack Query、Zustand、i18next/react-i18next、Dexie、DOMPurify、Lucide、ECharts。入口和业务组件能找到这些依赖的真实调用。UI 是原生元素与自定义 CSS，没有当前运行的 Vue、Pinia、Element Plus 或 Axios 层。
- `main.tsx` 设置查询默认值：30 秒 staleTime、不在窗口聚焦时重取、失败重试一次。远程数据主要用 `useQuery`；写入主要是 async handler 后调用 `invalidateQueries`，不是统一的 mutation 封装。
- `stores/app.ts` 保存用户、公开配置、当前邮箱、主题、导航、写信模式及 toast。组件内 `useState` 保存表单、分页和弹窗状态。修改数据时要同时考虑查询缓存和 Zustand 中的已选对象。
- `App.tsx` 的 Protected 依赖 `localStorage.token` 和 `/my/loginUserInfo`；`AdminGuard`、导航和按钮通过 `hasPerm` 检查精确权限 key 或 `*`。这些前端检查不能代替 Worker 权限与资源归属检查。
- 样式集中在 `styles.css`，通过 `document.documentElement.dataset.theme` 选择亮/暗主题；系统主题用 `matchMedia`。中文/英文有迁移资源和 `i18n/index.ts` 的补充覆盖，也存在直接写在 JSX 中的中文文案。
- `vite.config.ts` 输出到 `../mail-worker/dist` 并清空该输出目录。PWA 自动注册更新，预缓存静态文件；没有 API runtime cache。SPA 导航回退排除 `/api/`、`/static/`、`/attachments/` 和 `/mail/attachments/`。

### Backend and request dispatch

当前 Worker 目录（全部业务源码为 TS，文件名沿用现有约定）：

```text
mail-worker/
├─ src/index.ts                fetch/email/scheduled，satisfies ExportedHandler<WorkerEnv>
├─ src/hono/                   createHono / createApp，显式注册
├─ src/api/                    17 个 HTTP endpoint 模块
├─ src/security/               JWT/KV 会话、用户 context、权限映射
├─ src/service/                业务规则、工作流、个人/全站邮件查询、settings-reader
├─ src/dao/                    7 个持久化/聚合模块
├─ src/entity/                 12 张表与 ORM 工厂
├─ src/integrations/           mail-sender / oauth-client / ai / turnstile / s3 gateway
├─ src/email/email.ts          MIME 入站与推送流程
├─ src/types/                  Env/Context/DTO/领域/DB 类型及 linkedom 声明
├─ src/error/                  BizError / HTTP 映射 / unknown error message
├─ src/lib/                    ID 参数、缺行、邮件投影/摘要/附件关联、历史字符串列表边界
├─ src/{const,init,model,utils,template,i18n}/
├─ worker-runtime.d.ts         Wrangler 生成的 runtime-only 类型
├─ tsconfig.json / eslint.config.mjs
├─ scripts/                    build/deploy 校验与回归基础设施
└─ test/{unit,contracts,fixtures,helpers}/
```

`mail-worker/src/index.ts` 的 HTTP 分派顺序不能随意改变：

1. `/api/*` 去掉 `/api` 前缀，进入 `hono/webs.ts` 导出的 app。
2. `/static/*`、`/attachments/*`、旧 `/mail/attachments/*` 进入 `kv-obj-service.toObjResp`；旧路径先规范化为 `attachments/` key。
3. 其余请求交给 `env.assets.fetch`，由 assets SPA 配置处理前端路由。

`hono/hono.ts` 的 createHono 创建带类型的 Hono<AppEnvironment>，接入 CORS 和 error/hono-error-handler.ts。hono/webs.ts 的 createApp 先 registerSecurity，再按代码中的固定顺序调用 17 个 register*Api；最终只导出一个已组装 app。API 和 i18n 不反向 import app，也不靠副作用初始化注册路由。65 个 URL/method 的冻结基线在 test/fixtures/routes.json。

i18n 资源在模块加载时一次同步初始化；业务方法用 tFor(c) 取得按当前请求 accept-language 选择的翻译函数。email/scheduled 的 env-only context 默认中文。不要 changeLanguage 或在模块级存放请求语言、用户或配置。

API 层读取 c.req.query()/param/json，传入独立 DTO 或 service 输入类型，通常返回 c.json(result.ok(data))；不增加 Controller 层。service 组织业务和副作用，dao 提供已抽出的持久化叶子，entity 定义 Drizzle mapper。ORM 每次通过 orm(c) 从当前 binding 构造；没有跨请求数据库/用户/设置单例。允许复杂领域 SQL 仍在 service 中，但可复用持久化操作应下沉 dao；严禁 dao→service 与 app→API→app 的环。

个人邮件 `GET /email/list`、`GET /email/latest` 直接调用 `service/mail-query-service.ts` 的 listPersonalMail/latestPersonalMail，显式传 userId；该模块只组织读取、分页及返回装配，不依赖 email-service、角色、设置、存储或 sender。list 的可选 req 能力只用于请求语言，不读取 Hono get/set/user/setting。全站 GET /allEmail/list、GET /allEmail/latest 直接调用 all-mail-query-service 的 listAllMail/latestAllMail，使用 EnvContext，不读取 user/setting/req/get/set；权限仍由 security 的 all-email:query 映射及原管理员判断执行。全站过滤器私有，不能因个人/全站共用装配而合并查询范围。星标 SQL 与 add/cancel 仍在 star-service；all-email API 的两个 DELETE 继续调用 email-service。列表附件由调用方直接读 attDao，再交 lib/email-list-attachments.attachListAttachments 关联；摘要及 brief 字段删除由 lib/email-list-text 处理，两者均不执行查询。

`GET /user/list` 继续由 user-service.list 组织读取；SQL显式选择15个非凭据用户字段和5个OAuth字段，再补六类计数与sendAction，共27个顶层字段。types/user.ts 的 UserListItem/UserListPage 使用固定Pick字段，完整UserRow/NewUser仍供登录和持久化；禁止将getTableColumns(user)、Omit<UserRow,...>或Entity新增列自动展开为列表响应。列表不返回password/salt，也不修改数据库凭据、密码验证或KV会话字段。

Worker 使用 TypeScript 5.9.3、Hono 4.12.16、Drizzle 0.42.0、Wrangler 4.90.0，打包为 Worker JavaScript ESM；本次保留已有业务依赖解析版本。tsconfig strict=true、allowJs=false、noEmit=true；lib 仅 ES2022 + 生成的 Worker runtime，不能引入 Node-only API 或用浏览器 DOM/Node 类型掩盖运行时问题。

### Authentication and authorization

- `login-service.ts` 验证用户状态与密码；`crypto-utils.ts` 当前使用随机 salt 与 SHA-256(salt + password)，不是 bcrypt。`jwt-utils.ts` 使用 Web Crypto 实现 HS256。
- 登录 JWT 含 `userId` 和随机 `token`，普通登录生成时未传 JWT exp；有效性还依赖 KV 的 `auth-uid:<userId>` 会话及其中的 tokens 数组。初始 KV TTL 为 30 天，security 按日期刷新；不要把 JWT exp 当成当前会话唯一有效期来源。
- `security/security.ts` 分别处理排除路径、`/public` 的全局 API token、普通 JWT/KV 验证及权限映射。排除和权限匹配用 `startsWith`。`requirePerms` 与拼写为 `premKey` 的映射都是手工清单，新增路由不会自动获得权限检查。
- 用户 `type` 实际关联 `role.roleId`；权限由 `perm` 和 `role_perm` 查询。管理员按邮箱是否等于 `env.admin` 判断，`loginUserInfo` 返回 `permKeys: ['*']` 和合成管理员角色。不是一条固定的数据库管理员 role。
- `/public/genToken` 用管理员邮箱/密码生成并覆盖 KV `public_key:`；其他 public 路由用原始 Authorization token 比对，提供跨用户邮件查询和批量建用户，不受当前用户 mailbox 范围约束。

## Core Business Flows

### Registration, mailbox creation and OAuth

- 密码注册：`LoginPage.tsx` → `api/auth.ts` → `api/login-api.ts` → `login-service.register`。检查注册开关、邮箱前缀/域名、密码、注册码额度和过期日、角色可用域名、Turnstile 或 IP 次数阈值；写入 user 与主 account，并减少注册码次数。响应是验证状态信息，前端随后切回登录；注册不会直接返回普通登录会话。
- 新增附属邮箱：`AppLayout.tsx` → `api/mail.ts` accounts → `account-api.ts` → `account-service.add`。依赖 manyEmail/addEmail、角色数量/域名限制和验证码策略。显式添加 `name+tag` 账户要求基础地址属于当前用户。
- 注册与新增邮箱共用 `components/TurnstileWidget.tsx` → `utils/turnstile.ts`。仅在 SDK 的 render/remove 方法就绪后创建 widget，复用同一加载任务；失效/错误与卸载清空 token，卸载用 remove。不要使用 `id="turnstile"` 或只凭 `window.turnstile` 存在判断 SDK 就绪：浏览器会把同名 DOM 元素暴露为该全局属性。
- 入站和站内投递均支持先精确匹配 `name+tag@domain`，未找到再匹配去掉 tag 的主地址。不要删除 `emailUtils.getBaseEmail` 回退。`allReceive=1` 是当前用户所有账户邮件的查询模式，`setAllReceive` 先清除该用户其他账户的开关；不是全站 catch-all 或外部路由配置。
- OAuth：`LoginPage` 与 `SetupAccountPage` 的切换 Google 账号调用 `utils/oauth.ts`，写 `sessionStorage.oauthRequest`（provider/state/redirectUri），跳转 Google/GitHub/LinuxDo。三者分别使用 `/auth/google/callback`、`/auth/github/callback`、`/auth/linuxdo/callback`，共用 App 的 `/auth/:provider/callback` 和 `OAuthCallbackPage`；`/login` 只渲染登录表单。回调核对必需的路由 provider、state、当前 origin 的精确专用 redirectUri，并清除 URL 中的授权参数，再请求 `/oauth/{provider}/login`（LinuxDo API 拼写是 `linuxDo`）。第三方控制台的 URL 要同步，见 `mail-react/OAUTH_SETUP.md`；不恢复旧 `/login` 回调兼容。
- `oauth-service.ts` 在 Worker 交换授权码、获取第三方身份，以 platform/oauthUserId 查询/保存 oauth。已有绑定通过正常 login 返回会话；未绑定返回 900 秒、purpose 为 `oauth-setup` 的签名 setupToken。该证明存在 sessionStorage 的 `oauthSetup`，与 `localStorage.token` 分开。
- `SetupAccountPage` → `/oauth/bindUser {email, code, setupToken}`。Worker 验证 purpose/exp、oauthId、provider、subject、开关及未绑定状态，复用 register 创建邮箱后绑定并登录。OAuth 注册放开普通注册开关并跳过注册人机验证，但仍执行注册码、前缀、域名等规则。不得恢复仅凭客户端 oauth ID 绑定的旧方式。

### Receiving mail

`index.ts.email` → `src/email/email.ts`（ForwardableEmailMessage/WorkerEnv/ExecutionContext）：读取设置并检查 receive → 读取 raw 并用 PostalMime 解析 → 检查主题/正文/发件人黑名单 → 查询账户及 plus-address 回退 → 无收件人策略/角色域名与禁收规则 → 可选 Workers AI 验证码提取 → 写邮件 → 存附件 → 完成接收 → 可选推送。

初次写入使用 `status=SAVING(6)`、`isDel=1`，附件处理后 `completeReceive` 改为 `isDel=0` 和 RECEIVE(0) 或 NOONE(7)。无人收件而允许接收时 `userId/accountId=0`，供管理端查看。入站查询特意使用 IncludeDel 方法，不能把软删除筛选行为推断成所有路径一致。

附件 key 为 `attachments/` + 内容哈希 + 扩展名。CID 图片由 `emailService.imgReplace` 改成正文中的 `{{domain}}` 占位 URL。入站 attachments 与 cidAttachments 必须保存同一个对象引用：imgReplace 会标记 type=EMBED，再由 addAtt 入库；不能克隆 CID 对象导致类型丢失。AI 按开关和发件人/域名过滤，调用 `env.ai.run`；失败或无效结果返回空 code，不阻断接收。

邮件持久化后才按 ruleType/ruleEmail 决定是否推送：`telegram-service` 发机器人消息及签名查看链接；`message.forward` 转发到配置邮箱；`webhook-service` POST 邮件字段，可带原始 Authorization secret 并重试。当前推送在 email handler 内 await，没有队列消费者。`template/` 服务于 Telegram 展示；不能把 React 的 DOMPurify 保护推断成这些模板也具有相同过滤。

### Sending, replies and attachments

`Compose.tsx` → `api/mail.ts` → `email-api.ts` → `email-service.send`：正文图片转 CID → 检查发送开关并读取用户/角色 → 判断全部收件人是否站内 → 检查角色发送类型/次数及发件账户归属/域名 → 选择投递 → 写已发送邮件、附件、站内副本和计数。

- 所有收件人都属配置域名时，不调用外发服务；`HandleOnSiteEmail` 创建收件副本、共享附件 key，并根据收件人的权限/无人收件策略更新发件记录状态。
- 只要存在站外收件人，优先调用 `env.email.send`（Cloudflare Email binding），否则使用发件域名对应的 Resend token。混合收件人走这条外发路径，不再直接调用全站内副本逻辑。
- reply 携带原 emailId，读取 messageId 构造 in-reply-to/references；forward 是写信模式和引用正文，不是另一个转发 API。当前发送表单是 receiveEmail 数组、text/content、subject、attachments，没有发送 CC/BCC 参数消费逻辑。
- Resend 回调 `POST /api/webhooks` → `resend-service.webhooks`，按 data.email_id 匹配 resendEmailId，更新 delivered/bounced/complained/delayed/failed 状态。该入口在 security 排除清单，当前代码未接入 Resend 回调签名校验；不得把它写成已存在能力。
- 上传是 JSON 内 base64，经 XHR 提供进度，不是 multipart 或独立预上传接口。普通附件和正文图片各有后端 10 个限制，检查发生在部分投递/持久化操作之后；不能假定失败一定没有副作用。

### Lists, detail, drafts and administration

- `MailPage.tsx` 同时承载 inbox/sent/starred/all/detail。列表先取 `full=0`，再取 `full=1` 合并；email-list-columns 定义两种 SQL 投影。brief 返回最多 300 字符 listText 并删除 text/content；full 列表保留正文和普通 attList，不新增 listText；个人/全站 latest 则同时保留正文、attList 与 listText。个人/全站列表缺省 full，星标缺省 brief。
- 个人/全站邮件列表用 emailId 游标，timeSort 选择升/降序，每页最多 50；个人 latest 固定收件、降序最多 20。星标保留自己的 size 规则，没有相同的默认值和 50 上限。账户用 sort 降序、accountId 升序的联合游标（accountId/lastSort），最多 30；用户列表用 num/size 偏移分页。不要统一成一种分页格式。
- 普通邮箱/管理端没有独立的按 ID 取详情 API。Detail 使用路由 state 的邮件或遍历完整列表（最多 25 页）寻找 ID；改变详情获取需检查列表投影、游标、返回列表上下文和权限。
- autoRefresh 是秒数，前端 setTimeout 发起即时 `/email/latest` 或 `/allEmail/latest` 查询，返回最多 20 条后使列表缓存失效；不是 WebSocket、SSE 或服务器长轮询。个人搜索只过滤当前加载页；全站搜索交给 all-mail-query-service 的私有 allMailFilters，采用原 NOCASE 前缀/LIKE 通配语义。
- read 只将 unread 从 0 改为 1；收藏另存 star。当前没有个人垃圾箱 API、标为未读 API 或服务端草稿 API。
- 草稿：`compose/drafts.ts` 的 Dexie 数据库以用户邮箱命名，版本 1 表为 `draft: ++draftId,createTime` 与 `att: draftId`。`DraftsPage` 通过 `open-draft` CustomEvent 交给 Compose，保留原发件账户及回复信息。保存/删除同时处理两表；不要未经迁移改变数据库名、版本或 key。
- `AdminPage.tsx` 分发用户、角色、注册码管理；`SystemSettingsPage.tsx` 保存设置；`AnalysisPage.tsx` 将浏览器 IANA timeZone 发给 `analysis-service`/`analysis-dao`，显示总量、来源和过去 15 天趋势。统计缓存 key 包含时区，仅 analysis_cache 为 true 或字符串 'true' 时开启。

## Data Model and Persistence

持久化 schema 必须同时检查 `entity/*.ts` 的映射和 `init/init.ts` 的 SQL；没有 drizzle-kit migration 目录或自动 schema 同步。数据库未定义这里业务关系的外键级联，删除由 service 显式组织。

映射与建表存在实际差异：verify_record.ip 在实体写作 integer、DDL 为 TEXT；oauth.platform 在实体为 text、DDL 为 INTEGER；syncDelete 的实体默认值为 1，v3_1DB 添加列时默认 0。不要仅凭实体声明推断已有数据库的类型、默认值或历史数据。

| 表/存储 | 主要关系与格式 |
| --- | --- |
| `user` | userId、登录 email、password/salt、status/isDel、type（角色 ID）、sendCount、regKeyId、登录设备/IP |
| `account` | userId 下的邮箱，主邮箱地址与 user.email 一致；name、sort、allReceive、isDel |
| `email` | userId/accountId 归属，type：0 收件/1 发件；status、unread、isDel；正文 content/text、code、messageId/inReplyTo/relation、resendEmailId |
| `attachments` | userId/accountId/emailId、对象 key、MIME/文件信息、contentId；type：0 普通附件/1 正文图片；同 key 可被多条记录共享 |
| `star` | userId/emailId 收藏关系 |
| `role`、`perm`、`role_perm` | 角色配额、sendType、availDomain、banEmail 与权限树/按钮 key 的关联；默认身份由 isDefault 标记 |
| `reg_key` | 实际主键列拼写为 `rege_key_id`，映射为 regKeyId；角色、剩余次数、到期日及创建人 |
| `oauth` | 第三方身份和平台，userId=0 代表尚未绑定邮箱 |
| `verify_record` | IP、注册/新增邮箱类型、累计次数，用于验证码触发阈值 |
| `setting` | 全站单行设置；service 不使用租户/用户设置 ID |
| KV | `const/kv-const.ts` 的会话、setting 缓存、public token、按日发件数、按时区图表缓存；也可保存附件/背景二进制及 metadata |
| 对象存储、IndexedDB | 附件/背景经 r2-service 选择存储；草稿仅在前端 IndexedDB |

recipient/cc/bcc 是数据库 TEXT 内的 JSON 地址对象数组；resendTokens 是 TEXT 内的按域名 token 字典。role 的 banEmail/availDomain 和多项设置过滤字段存为逗号分隔字符串，管理表单可能展示为数组。公开 domainList 带 `@`，role.availDomain 存不带 `@` 的域名。避免混淆这些格式。

状态与开关以 `const/entity-const.ts` 为准：多数 setting 是 0 开/1 关，registerVerify/addEmailVerify 另有 2 阈值模式；account.allReceive、role.isDefault 是 1 开。不是通用布尔值。

### Deletion and scheduled maintenance

普通邮件/账户/个人注销按 syncDelete 决定软删除或物理删除；管理端物理删除、按条件批量删除、自动清理有不同调用链。用户恢复只恢复用户和主邮箱，type 参数为真时才进一步恢复邮件及其他账户；物理删除的数据无此恢复路径。

`att-service.removeAttByField` 查询只有单个引用的 key 后删除数据库记录，再尝试删对象。站内副本/正文图片可共享 key，不能按一封邮件的 key 直接删除所有文件。不同批量删除入口对 star 的清理并不完全一致，修改时逐个核对，不要假设存在统一 cascade。

当前配置 cron 为 `0 * * * *`。scheduled 依次清验证记录、重置日配额、处理 SAVING 状态、自动清邮件、刷新图表缓存、删除未绑定 oauth：

- clearRecord/resetDaySendCount 各自仅在 UTC 0 点执行；oauth 清理实际上每次普通 cron 都执行，不受其“凌晨”注释限制。
- autoCleanDays>0 时，以邮件 createTime 为界物理删除，按 autoCleanExclude 中的用户邮箱排除其 userId，每批 95 条；适用于各邮件类型。
- completeReceiveAll 只改 status，没有 completeReceive 中的 isDel 更新，不能宣称它完全恢复了中断的接收记录。
- index.ts 另有 cron 等于 `*/30 * * * *` 时仅刷新统计的分支，但当前 TOML 没有启用该 cron。

## API and Integration Patterns

`mail-react/src/api/client.ts` 默认基址 `/api`，可由 VITE_BASE_URL 覆盖。Authorization 是 localStorage 中的原始 token，没有 Bearer 前缀；accept-language 传给后端。普通 JSON 响应为 `{code, message, data}`，result.ok 无有效 data 时返回 null。

全局错误处理通常保持 HTTP 200，而将失败码放在 payload.code；前端同时检查 HTTP 与 payload，code=401 清会话并跳登录，其他失败抛 ApiError。BizError 默认 code=501；基础设施错误还有 KV/D1 未绑定和缺列提示。不要只依赖 HTTP 状态判成功。

| API 组（对外均加 `/api`） | 前端/后端联动位置 |
| --- | --- |
| `/login`、`/register`、`/logout`、`/my/*`、`/oauth/*` | `api/auth.ts`、`pages/`、`hooks/useFinishLogin.ts` ↔ login/my/oauth-api、对应 service |
| `/account/*`、`/email/*`、`/star/*`、`/allEmail/*` | `api/mail.ts`、layout/mail/compose ↔ account/email/star/all-email-api、对应 service |
| `/user/*`、`/role/*`、`/regKey/*`、`/analysis/echarts` | `api/admin.ts`、admin features ↔ user/role/reg-key/analysis-api；角色选项实际为 `/role/selectUse` |
| `/setting/websiteConfig`、`/setting/query`、`/setting/set` 等 | `api/auth.ts`、`api/settings.ts` ↔ setting-api/setting-service |
| `/public/*`、`/webhooks`、`/telegram/getEmail/:token`、`/oss/*`、`/init/:secret` | 面向外部调用/基础设施；不必存在 React 请求封装 |

最后一组有 JSON 以外的响应：初始化和 Resend webhook 返回文本，Telegram 返回 HTML，oss 返回文件流。API helper 不能不加区分地套用到这些接口。

附件/背景存储优先级在 `r2-service.storageType`：配置完整 S3 bucket/endpoint/access/secret → env.r2 → KV。`s3-service` 委托 integrations/s3-gateway 使用 AWS SDK；S3 批量删除有 Content-MD5 middleware。读对象返回形态不同：R2 object 与 KV/S3 Response，调用方须检查 body/arrayBuffer/httpMetadata 的使用。

特别注意直接 `/attachments` 和 `/static` 路径始终读 KV；`/api/oss/*` 才调用可切换的 r2-service。R2/S3 部署依赖正确的对象访问域名，不要假设换存储后这些 URL 自动转发。`utils/mail.ts`、后端 imgReplace/toImageUrlHtml、Telegram 模板共同消费 r2Domain 和 `{{domain}}`。

## Configuration and Environment

| 来源 | 当前实际配置 |
| --- | --- |
| Worker binding | `db`（D1）、`kv`（KV）、`assets` 必需；`r2` 为可选对象存储，`ai` 用于开启的验证码识别，`email` 用于优先外发；保持实际名称 |
| Worker vars | `domain`、`admin`、`jwt_secret`；可选 `ai_model`、`analysis_cache`、`orm_log`、`project_link` |
| 前端构建 | 唯一源码消费的 Vite env 为 `VITE_BASE_URL`；仓库未提供 env.release 或 `.env` 模板 |
| D1 setting + KV 缓存 | Resend/Turnstile/Telegram/S3/OAuth 凭据、对象域名、公告、过滤与推送/清理开关，参见 setting 实体及 SystemSettingsPage |
| 部署环境 | Actions 的 NAME/CUSTOM_DOMAIN/DOMAIN/ADMIN/JWT_SECRET、Cloudflare API token/account、D1/KV IDs、R2 bucket 和可选配置；参见 workflow 的 env 和替换步骤 |

settingService.refresh 从 D1 读取并将解析后的 resendTokens 缓存到 KV。业务读取直接调用 settingsReader.query，不依赖 settingService；settingService 的生产直接调用方只有 setting-api 和 init。settings-reader 从 KV 读取并可在 Hono context 中缓存，不依赖存储 service。set/setBlacklist/background 的写入后要 refresh。前端 SystemSettingsPage 保存后使 system/config 查询失效；增加字段需同时核对实体、升级 SQL、缓存转换、公开配置是否应暴露、表单及消费端。

GET /api/setting/query 仍调用 settingService.get，对部分密钥返回遮罩并附验证状态、storageType 和 binding flags；websiteConfig 只选择公开字段，不能用 reader 直接替代这些 HTTP 响应。前端用局部 patch 避免回写遮罩：S3/TG 某些空输入表示保留，Turnstile/OAuth 空输入会写空；resendTokens 是合并字典，指定域名的空值表示删除。不要全量回写 query 的对象，也不要假设所有秘密都采用相同遮罩/留空语义。

domain 在 TOML 中应优先使用数组。settingsReader.query 将 JSON 字符串形式的 domain 解析为数组并生成带 @ 的列表，但 register/addUser/account.add 等直接使用 env.domain.includes，不能推断所有消费者都做了相同规范化。project_link 当前被解释为显示上游项目链接的开关，不是任意 URL。

## Development Workflow, Build and Tests

以下命令从仓库根目录执行。CI 使用 Node 24、pnpm 11；两个子项目分别有 pnpm-workspace.yaml。使用 frozen lockfile，不能在无关改动中更新业务依赖。

```sh
pnpm -C mail-react install --frozen-lockfile
pnpm -C mail-worker install --frozen-lockfile
pnpm -C mail-worker run build
pnpm -C mail-worker run verify
```

Worker build = runtime 类型新鲜度检查 → tsc → React assets build → Wrangler 本地 dry-run 打包。verify = types:check → typecheck → type-aware lint → check:source → check:compat → Node unit → Wrangler 产物上的本地 Worker contracts。test 已是无部署的回归命令；test:worker 在运行前重新打包明确的 .wrangler/ts-build/index.js，不会默默使用旧产物。

```sh
pnpm -C mail-worker run types           # runtime 日期/工具链确实变化时重新生成
pnpm -C mail-worker run types:check
pnpm -C mail-worker run typecheck
pnpm -C mail-worker run lint
pnpm -C mail-worker run test:node
pnpm -C mail-worker run test:worker
pnpm -C mail-worker run check:source
pnpm -C mail-worker run check:compat
pnpm -C mail-worker run dev
pnpm -C mail-react run dev
pnpm -C mail-react run lint
node --test mail-react/scripts/oauth-callback.test.mjs mail-react/scripts/turnstile.test.mjs
git diff --check
```

Worker dev 使用 wrangler-dev.toml（本地模式）；Vite 将 /api、/static、两种附件路径代理到 localhost:8787。dev 中的 ID/域名/jwt_secret 是示例，不能当生产凭据。没有本地数据时应明确初始化本地环境，不能把启动 Vite 当成已有真实后端。

GET /api/init/:secret 要求 secret 等于 jwt_secret，调用 intDB 及 v1_1DB 至 v3_3DB，刷新 setting 缓存，返回文本 success。它不是健康检查，不自动创建管理员；历史升级链有非幂等数据更新、删旧字段与捕获异常的批处理，不能为验证自动对远程生产运行。

Node 回归覆盖真实模块装载、12 表/mapper/SQL 参数、NULL/undefined/历史 scalar、设置缓存、登录/注销/JWT/OAuth/角色/注册码、部署保护和既有三个脚本。Worker contracts 使用新建的临时 Miniflare D1/KV/R2、真实 Email emulator、冻结 65 路由/12 表/配置 fixture 与严格第三方请求捕获，覆盖 HTTP、auth、邮件收发/附件、三方错误、OAuth、定时任务、init 与历史升级。测试范围和模拟器限制见 mail-worker/test/fixtures/README.md；真实云配额/网络/SMTP/provider 控制台和 UTC 午夜完整联调不由这些测试证明。

设置读取回归见 test/unit/db-settings.test.mjs：缓存身份、env-only 重读、读取/验证/存储及 refresh 发布顺序。test/contracts/account-user-settings.test.mjs 固定账户开关与 COUNT 验证、账户/个人删除的 syncDelete 两分支、会话撤销及管理/公开设置响应；mail-inbound.test.mjs 固定设置失败发生于读取邮件流和其他副作用之前。

用户列表回归在 test/unit/user-list.test.mjs 与 test/contracts/user-list.test.mjs：固定27字段及nullable/历史scalar、筛选/分页/OAuth重复行现状、六类统计和sendAction，保护list→total→七路并发、失败/空集合。HTTP覆盖admin与仅user:query委托、撤权/认证、HEAD/OPTIONS、跨日metadata/KV刷新，以及真实登录和DB凭据保持；列表安全投影不能裁剪内部SessionUser。新增字段须明确修改投影、DTO与字段合同，不从Entity动态生成测试预期。

邮件读取回归在 test/unit/mail-query.test.mjs、test/unit/all-mail-query.test.mjs 与 test/contracts/mail-query.test.mjs：个人 allReceive/账户回退、全站搜索/count 条件 join、两种列表 Number/default/size、独立 marker、latest 原始 ID、三读并发/原异常/附件延后、正文/摘要/附件与空集合。个人和全站查询单测均直接装载真实读取模块，不需要 sender/存储/设置 mock。HTTP 合同保护五个入口及全站委托权限/撤权、个人范围、HEAD/OPTIONS、Header/Cookie 和前端 brief/full/detail/latest 使用；正式合同必须使用 test:worker 生成的 Wrangler 产物。

check:source 检查 src 无 JS/显式 any/Node import、失效 import 与运行时循环；check:compat 只读 React API 并检查其 57 个 URL/method 映射。前端旧 audit:compat 硬编码 Worker JS/副作用注册格式，会重写兼容报告，不能作为现有 TS Worker 验证命令；冻结的 Worker contract、check:compat 与真实前端 build 共同验证当前契约。前端独立 17 项 OAuth/Turnstile Node 测试保持不变。

### Deployment coupling

`wrangler.toml`、wrangler-test.toml、wrangler-action.toml 有构建 hook，安装/构建 mail-react；wrangler-dev.toml 没有。默认 wrangler.toml 的 D1/KV/R2 示例块是注释，keep_vars 不能补出缺失的资源绑定。不要直接拿默认文件覆盖已有部署绑定。

`.github/workflows/deploy-cloudflare.yml` 在 main 的两个应用目录变动或手工触发时运行；先 frozen install、build、verify，再处理原有资源绑定与发布。仍按 CLOUDFLARE_EMAIL 追加 email binding；自动 push 发布不会调用历史 init，只有手工触发并明确选择 initialize_database 才执行该升级链。首次安装/数据库升级需要独立检查数据和版本。AGENTS.md 单独变更不在 push paths 内。

pnpm -C mail-worker run deploy 先 build/verify，再经 scripts/deploy-worker.mjs 检查实际 Worker name、入口、db/kv/assets binding，最后发布；默认未配置绑定的模板会拒绝发布。deploy:test 使用原 wrangler-test.toml。自定义已配置的生产 TOML 可运行 pnpm -C mail-worker run build/verify 后，从 mail-worker 执行 node scripts/deploy-worker.mjs --config <file>；不能更换既有 ID/bucket/route 来绕过绑定检查。部署需要真实凭据，不属于普通本地验证。

`scripts/prepare-build-deploy.mjs` 是另一条 Workers Builds 适配路径：仅 WORKERS_CI=1 时启用，当前严格要求 WORKERS_CI_BRANCH 为 `frontend-react-rewrite`。它使用 CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID、WRANGLER_CI_OVERRIDE_NAME（默认 cloud-mail），从历史 Worker versions 找含 db/kv 的绑定，恢复可选 r2/email，写出被忽略的 wrangler-bindings.generated.json 及 `.wrangler/deploy/config.json`。找不到或存在不支持的绑定类型会拒绝该版本；不创建新资源。main 上的 Workers Builds 不能假定通过该分支限制。前端 build 会调用此脚本，改构建与分支条件前必须核对部署场景。

## Coding Conventions

- 前端以 PascalCase 命名 TSX 组件、camelCase 命名 API/helpers，普遍双引号、分号、两空格和相对 import；跨域对象用 types/index.ts 的 interface，管理表单/config 仍大量使用 any/Record，不能宣称已有完整严格业务类型覆盖。
- 前端 tsconfig strict=true、allowJs=true、noEmit=true；前端 i18n 字典是 JS。ESLint 使用推荐 JS/TypeScript 规则，关闭 no-explicit-any/no-unused-vars 等规则并忽略 vendored TinyMCE。Prettier 是依赖，但前端没有 format script 或专用配置。
- Worker 保留 kebab-case 文件和组合式 service/dao 对象；API→service→dao/entity/integration，按真实复杂度拆分。不创建空目录、Controller class 或仅转发一个简单调用的抽象。api 只负责 HTTP 适配；integration 包装外部 SDK/协议，service 决定业务规则。
- Worker `.editorconfig`/`.prettierrc` 约定 tabs、LF、单引号、分号、printWidth=140；实际也有双引号、未加分号和较新脚本两空格等例外。遵循编辑区域的主要风格，不做无关统一。
- 属性/API 参数通常 camelCase、SQL 列 snake_case，由 Drizzle 映射；保留已有 `domain-uitls.ts`、`date-uitil.ts`、`rege_key_id` 等拼写。修改名字须检查实际 import 和存储兼容。
- service 抛 BizError(t(key))，Hono 统一包装；外部推送和附件清理等辅助路径常 catch 后 console.error，其他错误可继续抛出。异步有顺序 await 和独立查询 Promise.all，没有统一日志抽象。
- 注释/文案主要中文，部分基础设施英文；对代码与注释冲突按执行逻辑判断。翻译资源分别位于前后端，增加跨端提示时检查两套 zh/en，不假设自动共享。

### Worker types, data access and integration rules

- src/types/env.ts 定义 WorkerEnv/Env；types/context.ts 定义 AppEnvironment、HttpContext、AppVariables、env-only Database/Config context。HTTP user/setting 存在 Hono context 内，email/scheduled 仅传 {env}；不要制造假 Hono request/get/set。
- worker-runtime.d.ts 由锁定 Wrangler、wrangler-dev.toml 的 compatibility_date 生成 runtime-only 类型，不包含部署 ID/secret。提交生成文件，不手写，不改 TOML 格式、兼容日期或 binding 名来解决 TS 错误。
- entity 的 $inferSelect/$inferInsert 推导 DB 类型；types/user、email、attachment、admin、settings 等定义业务/DTO。请求 ID 可为 string|number，CSV/JSON 字段与领域数组、请求 DTO 与 DB row 必须区分。entity 的 $type 仅表达历史 scalar union，不能趁类型化改变 builder/mapper/default/schema。
- lib/bound-id 在 WHERE 中保留原 string/null/undefined 绑定；INSERT 缺省值必须保留 Drizzle 的 default/literal null，不能无条件 sql.param(undefined)。附件复制显式 NULL 自增 ID、共享 key、boolean related 的 driver 参数有精确 SQL 回归。
- 邮件 list 的个人过滤器只服务 list/count，latest 保留自己的 RECEIVE/原 ID 绑定/20 条规则；不让 latest 转发 list。个人 list 的 latestEmail 没有 account join，与列表/total 的软删账户筛选不同。读取失败原样传播，三个主查询仍 Promise.all；不以重构之名新增参数拒绝或改变失败时点。
- user/list 保留 await列表→await总数→七路Promise.all，空列表也执行后续统计；不改OAuth join后的LIMIT/OFFSET、user-only total、strict角色匹配或管理员显示type=0。跨日security仍可更新操作者metadata与KV，不能把整个GET写成零写入；凭据剔除只作用于该响应。
- 全站 list 始终 LEFT JOIN user，count 只在 userEmail 真值时 join；count 无 cursor，latestEmail 固定为全局最新 RECEIVE，无记录返回三个0。全站 latest 独立保留原始 ID 绑定、降序20及已删/无人邮件范围，不添加当前用户/account/isDel过滤；list 与 latest 的 ID 转换不能统一。缺省/空/非法 type/full/size 按现有合同，不在读取重构中新增 validation。
- attachListAttachments 只关联已读结果，保留数组/行/附件身份、顺序及严格 ID 比较。批量 attDao.selectByEmailIds 只筛 ATT，不等于另有 userId/contentId IS NULL 的 attList 端点。个人/全站空列表跳过附件查询，星标 full 即使为空仍查；不要通过通用装配器改掉这一故障边界。attService.selectByEmailIds 仍供发送回读使用，不能误删。
- 纯设置读取者直接依赖 settings-reader，不增加 writer 的 query 转发入口。HTTP 传原始 context，env-only 事件仍传 {env}，后者每次读取 KV。reader 命中 context 时返回同一对象且不再加工；refresh 放入的 raw 字段及 get 的原地遮罩仍保留，不将这个对象放入全局。settingService.get 的设置读取成功后才启动验证记录查询，保留其现有 await 顺序。
- JWT/第三方 JSON 使用 unknown，在各用途消费者收窄；普通 KV 会话、900秒 OAuth setup、public token、Telegram view token 不得混用。HTTP DTO 类型注解不构成 runtime validation；新增拒绝/状态码/默认值属于单独业务变更。
- integrations/mail-sender 保留原生 Email 与 Resend 的 wire fields、CID/base64/ArrayBuffer、header 与副作用顺序；OAuth/Turnstile/AI/S3 gateway 包装协议。少数 vendor assertions 在确切 SDK 边界保留历史 nullable/畸形 payload，附契约测试；禁止扩散到业务层、as any、ts-ignore/nocheck 或假返回类型。
- error/biz-error.ts 表达领域错误；error/hono-error-handler.ts 保留 HTTP 200 + payload.code 及原 KV/D1 缺绑定/缺列映射。Resend webhook 文本500、object 404/405、Telegram HTML/初始化文本不能套普通 JSON response。lib/required-row 在原首次属性读取处保留缺行 TypeError，不能未经授权改成另一权限/业务错误。
- Type-aware ESLint 覆盖全部 src：no-explicit-any、no-unsafe-*、no-floating-promises、no-misused-promises、ban-ts-comment。关键 DB/SDK 操作必须 await；辅助 catch/log 的故障降级边界不可借重构改变。只允许一次资源/路由不可变初始化，不缓存请求 env/user/语言。

## Common Change Patterns and Areas Requiring Extra Care

| 任务 | 应一起检查的位置/关系 |
| --- | --- |
| 增改 API/权限 | Worker api、webs 注册、security 排除/requirePerms/premKey、service 归属检查、perm 初始化；前端 api/types、App guard、layout/button 条件、兼容扫描 |
| 改邮件列表/搜索/详情 | mail-query-service（个人）、all-mail-query-service（全站）、star-service、email-list-columns/text/attachments、init 索引、MailPage 的 brief/full/detail/latest 查询及缓存；各自的范围、字段与分页差异 |
| 改发送或附件 | Compose/RichEditor、client.postUpload、email.send/provider 转换、att-service、r2/s3/kv、正文占位与 URL；站内、混合、回复、失败后副作用 |
| 改注册/角色/账户 | Login/Setup/layout、login/account/role/reg-key/verify-record service；域名带 @ 差异、plus-address、注册码日界、配额、主邮箱保护 |
| 改 OAuth | 三个 pages、App callback 路由、utils/oauth、useFinishLogin、oauth-service、JWT 工具、oauth 实体和 Node tests；state、精确 callback URI、purpose/exp/identity/replay |
| 改人机验证 | LoginPage、AppLayout、TurnstileWidget、utils/turnstile、verify-record-service 和前端 Node tests；SDK 就绪、单次脚本加载、token 失效和组件卸载 |
| 改数据库/配置 | entity 和完整 init 升级链、setting cache、公开字段、前端表单 patch 和消费者、raw SQL；历史数据库重复升级与索引 |
| 改删除/定时任务 | user/account/email 的 soft/physics/restore/batch 分支、star/att、对象引用；UTC 重置、cron 清理与统计缓存 |
| 改 UI/持久状态 | styles.css、共享 Controls/Feedback、Zustand 与 Query 缓存、旧 localStorage 的 setting.lang/writer.sendRecipientRecord、Dexie 两表与 open-draft |
| 改 assets/部署 | Vite output/PWA、Worker dispatch、wrangler 四配置、prepare-build-deploy、Actions；附件必须避免 SPA fallback，原 D1/KV/R2 binding IDs 必须保留 |

额外边界：邮件正文由 MailPage 的 DOMPurify 与无 allow-scripts 的 sandbox iframe 展示，保留这两层及自适应高度逻辑；公告也用 DOMPurify。附件链存在 contentType/mimeType/type 的格式差异：Compose 新附件提供 contentType，saveSendAtt 读取 type，而 provider 转换另有 fallback；改动前逐个核对，不假定全链已经统一。loginService.logout 已 await 当前 token，并且仅在索引存在时移除，保证其他会话保留；不得把 unknown token 的 -1 当作数组末尾。logout 的 KV 重写仍保留原 TTL 省略行为，后续会话 TTL 改造须另作契约评审。

已核对的文档不一致：根 README/README-en 技术栈已写 React，但目录树仍列 app.vue、axios、views、env.release 等旧结构；FRONTEND_MIGRATION 中将 latest 称作 long polling，且部分路由/组件记录沿用旧名；当前系统设置实现在 SystemSettingsPage.tsx，OAuth setup 实现在独立 pages。上述文档及 compat-api.generated.md 用于历史对照，不能覆盖当前实现，也不能证明真实服务已验证。

## Agent Guidelines

1. 修改前先读相关入口、调用方、被调用方和数据流，跨前后端/存储时读完整调用链；不要只修改表面组件或按文件名猜行为。
2. 优先遵循当前架构和局部代码风格；不因个人偏好改框架、状态工具、数据访问层或重构无关模块。
3. 改公共接口、字段、状态码、配置、组件或工具时搜索全部消费者，包括 raw SQL、scheduled/email 事件、模板、Node tests、PWA 和历史持久状态。
4. 不臆造 API、数据库列、env 或业务流程；依赖声明、README、注释及历史审计都须由当前 import/配置/执行路径确认。
5. 对看似异常的兼容逻辑先查用途：旧附件 URL、plus-address 回退、{{domain}}、大小写不敏感索引、原数据库 key/拼写、OAuth setup 证明和历史绑定恢复不可随手删除。
6. 权限同时检查服务端路由映射与资源归属；前端隐藏按钮不构成授权。保留 public API、普通会话、OAuth setup 和 Telegram 查看 token 的不同用途。
7. 存储、删除或升级改动核对主邮箱、共享对象引用、软删除恢复和操作副作用；不假定存在事务/级联或所有失败可回滚。
8. 修改完成运行相关且真实可用的检查、build/Node tests；前端更改至少 lint/build，兼容/配置变更检查 audit。报告失败原因与联调边界，不把 dry-run/静态覆盖说成线上成功。
9. Worker test/verify 仅做本地验证；deploy/deploy:test 会发布。禁止为验证触发远程 init、批量删除、替代云资源，保持既有 binding IDs 和用户未提交修改。
10. 保持改动范围与当前任务相关；避免大面积格式化、改写 vendored TinyMCE、更新 lockfile 或提交 dist/.wrangler。API/配置/关键流程变化时同步本指南中受影响的内容。

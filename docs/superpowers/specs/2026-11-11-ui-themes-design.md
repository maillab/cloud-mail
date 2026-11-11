# 界面风格（管理员统一选择）设计文档

日期：2026-11-11
状态：用户已授权按此方案实施

## 1. 背景与目的

用户反馈现在的界面"整体看起来太普通"：基本是 Element Plus 默认主题加一个黑色侧栏，像现成的后台模板。用户在三版样式稿里先选了 B，随后改为"三种都做，由管理员统一选一种，全站用户看到同一个风格"。

## 2. 目标 / 非目标 / 反目标

**目标**

- 提供三种完整的界面风格：邮戳（postmark）、清爽工作台（workspace）、多邮箱色标（palette）。每种各有浅色和深色。
- 管理员在系统设置里选风格，保存在服务器，所有用户（含登录页）跟随，换浏览器、换设备不变。
- 用户仍可各自切换浅色 / 深色，存在各自浏览器里，和现在一样。
- 所有页面跟随风格切换：收件箱、邮件详情、写信、登录、个人设置、分析页、用户列表、全部邮件、权限、注册密钥、系统设置。

**非目标**

- 不改页面布局、功能入口、文案、手机端布局。
- 用户不能自己选风格。
- 不保留旧外观。
- 不改邮件正文的渲染样式（`shadow-html`、TinyMCE 编辑器内部）。

**反目标**

- 首屏闪烁：先看到旧样式或别的风格再跳到正确风格。
- 某种风格在深色下有看不清的文字或按钮。
- Element Plus 的弹窗、表格、开关在某种风格下还是蓝色默认值。

## 3. 约束

- 前端 Vue 3 + Element Plus + SCSS，样式体系是 `mail-vue/src/style.css` 里的一组 CSS 变量，`.dark` 类切换深色。Element Plus 的主色通过 `--el-color-primary*` 变量覆盖。
- 页面组件里写死了约 60 处颜色，必须先换成变量，风格切换才能全局生效。
- 公开站点配置来自 `GET /setting/websiteConfig`，前端在 `init.js` 里读取并存入 `settingStore.settings`，登录页也读它。
- 系统设置用通用的 `PUT /setting/set` 保存任意字段；数据库字段通过 `init/init.js` 的版本函数迁移。
- 另一条分支 `feat/account-forward` 已有 `v3_5DB`，本功能的迁移命名为 `v3_6DB` 以免合并时重名；两条分支合并时 `init()` 的调用列表会有一处小冲突，手工保留两行即可。
- 前端没有测试框架；后端有 `pnpm test:unit`（vitest，纯逻辑）。

## 4. 方案比较

| 方案 | 做法 | 取舍 | 结论 |
|---|---|---|---|
| A. 一套语义化变量，三种风格各写一组值，`html[data-theme]` 切换 | 组件只引用变量；风格文件只是变量赋值 | 一次性清理写死颜色；新增风格只需加一组变量 | **采用** |
| B. 三套独立样式表按风格加载 | 每种风格一个 CSS 文件 | 组件里的样式要写三遍，后续改动三处同步 | 放弃 |
| C. 运行时 JS 改 Element Plus 主题 | 用 EP 的主题 API 动态算色 | 只能改主色，侧栏结构、字体、标志元素做不到 | 放弃 |

## 5. 用户看到的行为

### 5.1 三种风格

| | 邮戳 postmark | 清爽工作台 workspace | 多邮箱色标 palette |
|---|---|---|---|
| 侧栏 | 深海军蓝，白字 | 浅灰，比内容区略深 | 白色，右侧一条细边 |
| 强调色 | 邮戳红 + 航空蓝 | 深青绿 | 近黑 |
| 标题字体 | 宋体系（Songti SC / Noto Serif SC / SimSun） | 默认无衬线 | 默认无衬线 |
| 圆角 | 小（4px） | 中（8px） | 大（10px） |
| 标志元素 | 撰写按钮红蓝斜纹边框；未读邮件左侧 3px 红条 | 发件人首字头像 | 侧栏每个邮箱一个色点；邮件行左侧 4px 色条，颜色与收件邮箱对应 |

三种风格都有：验证码标签改为带底色的小药丸样式，点击复制（功能已有，只改样式）。

### 5.2 管理员入口

系统设置页"个性化设置"卡片里加一行"界面风格"，右侧显示当前风格名和一个设置按钮。点开对话框，三张预览卡片（沿用个人设置里浅色 / 深色卡片的画法，缩略图按各自风格上色），点选后点"保存"。保存后管理员自己立即切换，其他用户刷新页面后切换。

```
┌──── 界面风格 ──────────────────────────┐
│ ┌──────┐  ┌──────┐  ┌──────┐           │
│ │▮ ▬▬▬ │  │░ ▬▬▬ │  │  ▬▬▬ │           │
│ │▮ ▬▬  │  │░ ▬▬  │  │● ▬▬  │           │
│ └──────┘  └──────┘  └──────┘           │
│  邮戳     清爽工作台   多邮箱色标        │
│                              [保存]    │
└────────────────────────────────────────┘
```

### 5.3 首屏

页面加载时，在应用挂载之前就按上次记住的风格上色（`localStorage` 里的 `ui-theme`），拿到站点配置后如有不同再切换。新访客第一次打开，默认按清爽工作台，拿到配置后再切。

## 6. 数据与接口

- `setting` 表新增 `ui_theme TEXT NOT NULL DEFAULT 'workspace'`，Drizzle 字段 `uiTheme`。
- 允许值 `postmark | workspace | palette`。`settingService.set` 收到 `uiTheme` 时校验，不在列表内抛 `BizError(t('invalidUiTheme'))`。
- `settingService.websiteConfig` 返回 `uiTheme`。
- 迁移 `v3_6DB`：`ALTER TABLE setting ADD COLUMN ui_theme TEXT NOT NULL DEFAULT 'workspace'`，按现有 try/catch 跳过方式写。
- 常量 `settingConst.uiTheme = { POSTMARK: 'postmark', WORKSPACE: 'workspace', PALETTE: 'palette' }`。

## 7. 前端结构

### 7.1 变量层

`style.css` 重组为三层：

1. **语义变量**（新增，组件直接用）：

| 变量 | 含义 |
|---|---|
| `--font-heading` | 标题字体，默认 `inherit`，邮戳为宋体系 |
| `--radius-sm` `--radius-md` `--radius-lg` | 圆角三档 |
| `--surface-1` `--surface-2` `--surface-3` | 页面底、卡片、更深一层的填充 |
| `--sidebar-bg` `--sidebar-text` `--sidebar-text-muted` `--sidebar-border` `--sidebar-active-bg` `--sidebar-active-text` `--sidebar-hover-bg` | 侧栏 |
| `--compose-bg` `--compose-text` `--compose-hover-bg` | 撰写按钮 |
| `--unread-mark` | 未读标记颜色 |
| `--code-tag-bg` `--code-tag-border` `--code-tag-text` | 验证码标签 |
| `--avatar-1` … `--avatar-8`（每个带 `-bg` 和 `-text`） | 首字头像和邮箱色标的 8 色盘 |
| `--chart-1` … `--chart-6` `--chart-area-from` `--chart-area-to` | 分析页图表色 |
| `--login-gradient` | 登录页背景渐变 |
| `--theme-color-meta` | 手机浏览器地址栏颜色 |

2. **Element Plus 主色**：每种风格各自的 `--el-color-primary` 及 `-light-3/5/7/9`、`-dark-2`，浅色深色各一组。

3. **既有自定义变量**（`--aside-backgound`、`--base-fill`、`--regular-text-color` 等）保留名字，改为引用语义变量，组件改动最小。

选择器：`:root` 和 `.dark` 放 workspace（默认）；`html[data-theme="postmark"]`、`html[data-theme="postmark"].dark`、`html[data-theme="palette"]`、`html[data-theme="palette"].dark` 覆盖。

### 7.2 风格切换

- `utils/theme.js`：`applyUiTheme(name)` 设置 `document.documentElement.dataset.theme`，写 `localStorage['ui-theme']`，读取计算后的 `--theme-color-meta` 更新 `<meta name="theme-color">`。非法值当作 `workspace`。
- `index.html` 的启动脚本在设置 `.dark` 的同时按 `localStorage['ui-theme']` 设置 `data-theme`。
- `init.js` 拿到 `websiteConfig` 后调用 `applyUiTheme(setting.uiTheme)`。
- 管理员保存后调用 `applyUiTheme` 并更新 `settingStore.settings.uiTheme`。
- `theme-selector` 里切换深浅色时，地址栏颜色改为读 `--theme-color-meta`，不再写死。

### 7.3 标志元素

- `utils/mailbox-color.js`：`mailboxColorIndex(address) => 1..8`，对小写地址做稳定哈希；`senderInitial(name, address) => string`，取显示名第一个字符，没有名字取地址首字母，大写。
- 邮件行（`email-scroll`）：在星标和标题之间加 `<div class="sender-avatar">`，内容 `senderInitial`，`style="--avatar-index: n"`；行上加 `style="--mailbox-index: n"`（按 `toEmail`）。头像只在 workspace 显示，色条只在 palette 显示，未读红条只在 postmark 显示，都用 CSS 按 `html[data-theme]` 控制。骨架屏同步加占位。
- 侧栏邮箱卡片（`layout/account`）：地址前加 `<span class="mailbox-dot">`，按 `item.email` 取色，只在 palette 显示。
- 撰写按钮（`layout/aside` 的 `.compose-bar`）：postmark 下用双层背景做 3px 红蓝斜纹边框。
- 标题：header 面包屑、邮件详情标题、个人设置 / 系统设置 / 分析页的标题改用 `font-family: var(--font-heading)`。
- 验证码标签 `.code-tag`：去掉方括号，药丸样式，`font-variant-numeric: tabular-nums`。

### 7.4 分析页

图表颜色改为运行时读取 CSS 变量（`getComputedStyle(document.documentElement).getPropertyValue`），风格或深浅色变化时重算并重绘。

### 7.5 写死颜色的处理

| 处理 | 范围 |
|---|---|
| 换成变量 | `layout/aside`、`layout/account`、`layout/write`、`components/email-scroll`、`views/analysis`、`views/login`、`views/setting`、`views/user`、`views/reg-key`、`views/sys-setting`、`components/theme-selector`、`components/tiny-editor` 的滚动条色 |
| 保留 | `shadow-html`（邮件正文容器，不随站点风格）、`icon-utils`（文件类型图标固有色）、`icons/index.js`（SVG 数据）、`layout/main` 手机端遮罩黑色、`sys-setting` 里第三方品牌图标色 |

## 8. 留给实现者的

- 8 色盘的具体色值，要求浅色底深色字、深色模式下反过来，相邻色相区分明显。
- 斜纹边框的具体实现（`background-clip` 双层背景或 `border-image`）。
- 风格预览卡片的缩略图画法。
- 迁移位置：`init()` 里 `v3_4DB` 之后。

## 9. 验证方式

- 后端 `pnpm test:unit` 通过；本地 `/api/init` 重复执行成功；`websiteConfig` 返回 `uiTheme`；`PUT /setting/set {"uiTheme":"xxx"}` 被拒。
- 前端 `pnpm build` 通过。
- 浏览器逐一核对 3 风格 × 2 深浅 = 6 种组合下的：登录页、收件箱（含全部收件模式）、邮件详情、写信窗口、个人设置、系统设置、分析页、用户列表，以及手机宽度（375px）下的收件箱和侧栏。
- 刷新页面无闪烁；管理员切换后立即生效；另开无痕窗口登录看到同一风格。

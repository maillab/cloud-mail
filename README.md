<p align="center">
    <img src="doc/demo/logo.png" width="80px" />
    <h1 align="center">Cloud Mail</h1>
    <p align="center"><strong>基于 Cloudflare 的一站式邮箱服务平台</strong></p>
    <p align="center">
        <a href="https://www.cloudflare.com/" target="_blank">
            <img src="https://img.shields.io/badge/Cloudflare-F38020?labelColor=F38020&amp;color=F38020&amp;logo=cloudflare&amp;logoColor=white" alt="Cloudflare" />
        </a>
        <a href="https://github.com/maillab/cloud-mail/releases" target="_blank" >
            <img src="https://img.shields.io/github/v/release/maillab/cloud-mail?logo=github&amp;logoColor=white" alt="releases" />
        </a>
        <a href="https://github.com/maillab/cloud-mail/tree/main?tab=MIT-1-ov-file" target="_blank" >
            <img src="https://img.shields.io/badge/license-MIT-green" />
        </a>  
    </p>
    <p align="center" >
        <a href="https://skymail.ink">在线演示</a> · <a href="https://docs.skymail.ink">部署文档</a> ·
        <a align="center"><a href="README-en.md">English</a> | 简体中文</a>
    </p>
    <p align="center">
        <a href="https://trendshift.io/repositories/20459" target="_blank" >
            <img src="https://trendshift.io/api/badge/repositories/20459" alt="trendshift" >
        </a>
        <a href="https://hellogithub.com/repository/1b1da1f9ae4c4175baa3d762b4e0ba41" target="_blank">
            <img src="https://api.hellogithub.com/v1/widgets/recommend.svg?rid=1b1da1f9ae4c4175baa3d762b4e0ba41" alt="HelloGitHub" />
        </a>
    </p>
</p>


## 项目简介

只需要一个域名，就可以创建多个不同的邮箱，类似各大邮箱平台，本项目支持部署到 Cloudflare Workers ，降低服务器成本，搭建自己的邮箱服务

## 项目展示

| ![](/doc/demo/demo.jpg)  | ![](/doc/demo/demo1.jpg) |
|--------------------------|--------------------------|
| ![](/doc/demo/demo2.jpg) | ![](/doc/demo/demo3.jpg) |


## 推荐项目

<table>
  <tr>
    <td valign="middle">
      <a href="https://github.com/pixtalelab/pixtale">
        <img width="30" src="https://img.022335.xyz/logo.png" alt="Pixtale" align="middle">
      </a>
    </td>
    <td valign="middle">
      <a href="https://github.com/pixtalelab/pixtale">Pixtale</a>
    </td>
    <td valign="middle">
      一个自托管云存储相册应用
    </td>
  </tr>
</table>

## 功能介绍

- **💰 低成本使用**： 可部署到 Cloudflare Workers 降低服务器成本

- **💻 响应式设计**：响应式布局自动适配PC和大部分手机端浏览器

- **📧 邮件发送**：集成 Cloudflare Email、Resend 和 Mailjet 发送邮件，支持群发

- **🛡️ 管理员功能**：可以对用户，邮件进行管理，RABC权限控制对功能及使用资源限制

- **📦 附件收发**：支持收发附件，使用R2对象存储保存和下载文件

- **🔔 邮件推送**：接收邮件后可以转发到TG机器人或其他服务商邮箱

- **📡 开放API**：支持使用API批量生成用户，多条件查询邮件 

- **🔢 验证码识别**：使用Workers AI，自动识别邮件验证码 

- **📈 数据可视化**：使用ECharts对系统数据详情，用户邮件增长可视化显示

- **🎨 个性化设置**：可以自定义网站标题，登录背景，透明度

- **🤖 人机验证**：集成Turnstile人机验证，防止人机批量注册

- **📜 更多功能**：正在开发中...



## 技术栈

- **平台**：[Cloudflare Workers](https://developers.cloudflare.com/workers/)

- **Web框架**：[Hono](https://hono.dev/)

- **ORM：**[Drizzle](https://orm.drizzle.team/)

- **前端框架**：[Vue3](https://vuejs.org/) 

- **UI框架**：[Element Plus](https://element-plus.org/) 

- **邮件发送：** [Cloudflare Email](https://developers.cloudflare.com/email-service/) / [Resend](https://resend.com/) / [Mailjet](https://www.mailjet.com/)

- **缓存**：[Cloudflare KV](https://developers.cloudflare.com/kv/)

- **数据库**：[Cloudflare D1](https://developers.cloudflare.com/d1/)

- **文件存储**：[Cloudflare R2](https://developers.cloudflare.com/r2/)

## 自动部署、保留绑定与自动初始化

Cloudflare 的 Git 集成负责构建和部署。GitHub Actions 先等待同一次提交的 **Workers Builds: cloud-mail** 检查成功，再确认正式站点的 `/deployment.json` 提交号与本次一致，最后调用初始化接口；部署失败、正式站点未更新或等待超时会停止。**GitHub 不需要 Cloudflare API Token 或 Account ID**，读取部署检查使用 Actions 自动提供的 GitHub Token。

默认 `wrangler.toml` 通过上传元数据的 `keep_bindings` 保留控制台已有的 KV、D1、R2、邮件服务、AI 绑定及运行时变量和密钥。首次使用需在 Cloudflare 绑定 `kv`、`db`，配置运行时 `domain`、`admin`、`jwt_secret`；以后部署沿用这些绑定。保留机制见 [Cloudflare 上传元数据说明](https://developers.cloudflare.com/workers/configuration/multipart-upload-metadata/)。

Cloudflare **Worker → Settings → Builds** 使用以下设置：

| 设置 | 值 |
| --- | --- |
| 生产分支 | `send`（与下方 `PRODUCTION_BRANCH` 一致） |
| 根目录 | `mail-worker` |
| 构建命令 | `pnpm run build` |
| 部署命令 | `pnpm run deploy` |

正式部署命令明确使用 `mail-worker/wrangler.toml`。`wrangler-dev.toml`、`wrangler-test.toml` 包含示例资源 ID，分别用于开发和测试；`wrangler-action.toml` 是旧部署模板。若日志中出现不存在的示例 KV/D1 ID，请核对所部署的分支、提交和配置文件。Cloudflare Builds 的前端构建由上面的构建命令完成。

依赖安装时的 `postinstall` 也会自动构建前端并生成 `dist/deployment.json`，因此构建命令留空的预览任务也有完整静态文件。若启用预览构建，在 **Previews Base** 中使用同样的构建命令、根目录，预览命令为 `pnpm run preview`。日志执行 `wrangler preview` 表示该次是预览构建；正式站点需要 **Production** 下的 `send` 分支执行 `pnpm run deploy`。Actions 会验证正式站点提交号，预览成功不会直接触发生产数据库初始化。

在仓库 **Settings → Secrets and variables → Actions** 配置：

| 名称 | 用途 | 示例 |
| --- | --- | --- |
| `DOMAIN` | 应用访问域名 | `firemail.pp.ua` |
| `JWT_SECRET` | 与 Worker 运行时 `jwt_secret` 相同；Secret 和 Variable 均支持 | 已配置的密钥 |
| `NAME`（可选） | Worker 名称，用于选择对应的 Cloudflare 部署检查；默认 `cloud-mail` | `cloud-mail` |
| `PRODUCTION_BRANCH`（可选） | Cloudflare 生产部署分支；默认 `send`，其他分支不初始化生产应用 | `send` |
| `APP_URL`（可选） | 应用地址与 `DOMAIN` 不同时优先使用；兼容旧变量 `CUSTOM_DOMAIN` | `https://mail.example.com` |

推送到生产部署分支（默认 `send`）且修改应用代码时自动运行。Cloudflare 必须将该分支部署到此应用，并允许构建修改的路径；未触发 Cloudflare 构建会使初始化工作流等待超时。多次推送会取消同分支的旧初始化任务。需要重跑时，在 **Actions → Initialize cloud-mail after Cloudflare deployment → Run workflow** 选择生产部署分支。

初始化只执行数据库升级并刷新设置缓存，不部署 Worker、不创建资源。网络或服务端短暂错误会重试；密钥不匹配或响应不是 `success` 会报错。GitHub 变量不会同步到 Cloudflare：Actions 的 `DOMAIN` 定位初始化地址，Worker 的 `domain` 仍为邮箱域名数组（如 `["firemail.pp.ua"]`）；旧的 Actions 域名数组使用第一项，访问地址不同请设 `APP_URL`。

若应用启用了 Cloudflare Access，并希望 Actions 无需额外凭据，进入 **Zero Trust → Access → Applications**，为以下路径创建独立的 Self-hosted 应用，分别设置 **Bypass → Include → Everyone**：

| 域名 | 路径 | 用途 |
| --- | --- | --- |
| `firemail.pp.ua`（替换为应用域名） | `deployment.json` | 公开的构建提交号 |
| 同上 | `api/init/*` | 初始化接口，应用仍验证 `JWT_SECRET` |

保留原来覆盖整个站点的登录策略，仅对这两个路径建立更具体的应用；不要把全站策略改为 Everyone。Cloudflare 对更具体路径优先应用其独立策略，见 [应用路径](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/) 和 [路径放行](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/common-policies/#bypass-a-public-endpoint)。工作流不会修改 Access 配置，遇到 Access 登录重定向会明确报错。

## Mailjet 发信配置

1. 更新部署后，Actions 自动执行 `/api/init/<JWT_SECRET>`，添加 `mailjet_tokens` 字段并刷新设置缓存；也可手动重跑初始化工作流。
2. 在 Mailjet 验证发件域名或地址，然后进入 **系统设置 → 邮件设置 → Mailjet 邮件发送**，选择发件域名并填写 **API Key** 和 **Secret Key**。密钥仅保存在后端，配置列表显示脱敏值。
3. 配置了 Mailjet 的域名通过 Mailjet 发送站外邮件；其余域名继续优先使用 Cloudflare Email，其次 Resend。纯站内邮件仍在站内投递。两项密钥都留空保存可删除该域名的 Mailjet 配置。

支持普通群发、分开发送、附件、正文 CID 图片和回复邮件。分开发送自动按每批最多 50 封提交，每位收件人独立一封；部分失败时保留已成功的发件记录，仅重试失败或尚未提交的收件人。Mailjet 接受请求后记录为“已发送”，不代表已投递。

实现基于 [Mailjet Send API v3.1](https://dev.mailjet.com/docs/email-api/send-api-v31/send-basic-email)。开发验证可使用 [SandboxMode](https://dev.mailjet.com/docs/email-api/send-api-v31/sandbox.mode)，校验实际 API 请求而不投递邮件。后端回归测试：`cd mail-worker && pnpm test:unit`。

## 目录结构

```
cloud-mail
├── mail-worker                    # worker后端项目
│   ├── src
│   │   ├── api                    # api接口层
│   │   ├── const                  # 项目常量
│   │   ├── dao                    # 数据访问层
│   │   ├── email                  # 邮件处理接收
│   │   ├── entity                 # 数据库实体
│   │   ├── error                  # 自定义异常
│   │   ├── hono                   # web框架配置、拦截器、全局异常等
│   │   ├── i18n                   # 语言国际化
│   │   ├── init                   # 数据库缓存初始化
│   │   ├── model                  # 响应体数据封装
│   │   ├── security               # 身份权限认证
│   │   ├── service                # 业务服务层
│   │   ├── template               # 消息模板
│   │   ├── utils                  # 工具类
│   │   └── index.js               # 入口文件
│   ├── pageckge.json              # 项目依赖
│   └── wrangler.toml              # 项目配置
│
├── mail-vue                       # vue前端项目
│   ├── src
│   │   ├── axios                  # axios配置
│   │   ├── components             # 自定义组件
│   │   ├── echarts                # echarts组件导入
│   │   ├── i18n                   # 语言国际化
│   │   ├── init                   # 入站初始化
│   │   ├── layout                 # 主体布局组件
│   │   ├── perm                   # 权限认证
│   │   ├── request                # api接口
│   │   ├── router                 # 路由配置
│   │   ├── store                  # 全局状态管理
│   │   ├── utils                  # 工具类
│   │   ├── views                  # 页面组件
│   │   ├── app.vue                # 入口组件
│   │   ├── main.js                # 入口js
│   │   └── style.css              # 全局css
│   ├── package.json               # 项目依赖
└── └── env.release                # 项目配置
```

## 许可证

本项目采用 [MIT](LICENSE) 许可证	


## 交流

[Telegram](https://t.me/cloud_mail_tg)




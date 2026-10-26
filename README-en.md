<p align="center">
    <img src="doc/demo/logo.png" width="80px" />
    <h1 align="center">Cloud Mail</h1>
    <p align="center">An all-in-one email service platform powered by Cloudflare</p>
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
    <p align="center">
        <a href="https://skymail.ink">Live Demo</a> · <a href="https://docs.skymail.ink/en/">Deployment Guide</a> ·
        <a href="/README.md">简体中文</a> | English
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

## Description
With only one domain, you can create multiple different email addresses, similar to major email platforms. This project can be deployed on Cloudflare Workers to reduce server costs and build your own email service.
## Project Showcase

| ![](/doc/demo/en/demo.jpg)  | ![](/doc/demo/en/demo1.jpg) |
|-----------------------------|-----------------------------|
| ![](/doc/demo/en/demo2.jpg) | ![](/doc/demo/en/demo3.jpg) |

## Recommended Project

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
      A self-hosted cloud storage photo album app
    </td>
  </tr>
</table>

## Features

- **💰 Low-Cost Usage**: No server required — deploy to Cloudflare Workers to reduce costs.

- **💻 Responsive Design**: Automatically adapts to both desktop and most mobile browsers.

- **📧 Email Sending**: Integrated with Cloudflare Email, Resend and Mailjet for sending email.

- **🛡️ Admin Features**: Admin controls for user and email management with RBAC-based access control.

- **📦 Attachment Support**: Send and receive attachments, stored and downloaded via R2 object storage.

- **🔔 Email Push**: Forward received emails to Telegram bots or other email providers.

- **📡 Open API**: Supports batch user creation via API and multi-condition email queries

- **🔢 Verification Code Recognition**: Auto-detect codes via Workers AI

- **📈 Data Visualization**: Use ECharts to visualize system data, including user email growth.

- **🎨 Personalization**: Customize website title, login background, and transparency.

- **🤖 CAPTCHA**: Integrated with Turnstile CAPTCHA to prevent automated registration.

- **📜 More Features**: Under development...

## Tech Stack

- **Platform**: [Cloudflare Workers](https://developers.cloudflare.com/workers/)

- **Web Framework**: [Hono](https://hono.dev/)

- **ORM**: [Drizzle](https://orm.drizzle.team/)

- **Frontend Framework**: [Vue3](https://vuejs.org/)

- **UI Framework**: [Element Plus](https://element-plus.org/)

- **Email Sending**: [Cloudflare Email](https://developers.cloudflare.com/email-service/) / [Resend](https://resend.com/) / [Mailjet](https://www.mailjet.com/)

- **Cache**: [Cloudflare KV](https://developers.cloudflare.com/kv/)

- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/)

- **File Storage**: [Cloudflare R2](https://developers.cloudflare.com/r2/)

## Automatic deployment, binding preservation, and initialization

Cloudflare's Git integration builds and deploys the Worker. GitHub Actions waits for **Workers Builds: cloud-mail** to succeed for the same commit, verifies the production site's `/deployment.json` commit, then calls the initialization endpoint. Failed builds, an outdated production site, or timeouts stop initialization. **No Cloudflare API token or account ID is needed in GitHub**; reading build checks uses the automatically provided GitHub Actions token.

The default `wrangler.toml` uses upload metadata `keep_bindings` to preserve dashboard-managed KV, D1, R2, email, and AI bindings, as well as runtime variables and secrets. Initially bind `kv` and `db` in Cloudflare and configure the runtime `domain`, `admin`, and `jwt_secret`. Future deployments retain those bindings. See [Cloudflare upload metadata](https://developers.cloudflare.com/workers/configuration/multipart-upload-metadata/).

Configure Cloudflare **Worker → Settings → Builds** as follows:

| Setting | Value |
| --- | --- |
| Production branch | `send` (matching `PRODUCTION_BRANCH` below) |
| Root directory | `mail-worker` |
| Build command | `pnpm run build` |
| Deploy command | `pnpm run deploy` |

The production deploy script explicitly selects `mail-worker/wrangler.toml`. `wrangler-dev.toml` and `wrangler-test.toml` contain example resource IDs for development and testing; `wrangler-action.toml` is the legacy deployment template. If logs reference nonexistent example KV/D1 IDs, check the deployed branch, commit, and configuration file. Cloudflare Builds compiles the frontend through the build command above.

The installation `postinstall` hook also builds the frontend and writes `dist/deployment.json`, so Preview jobs have complete assets even when their build command is empty. If Preview builds are enabled, configure the same build command and root directory under **Previews Base**, with `pnpm run preview` as the Preview command. Logs showing `wrangler preview` describe a Preview build; the production site requires `pnpm run deploy` on the Production `send` branch. Actions verifies the production commit before applying database initialization.

Configure repository **Settings → Secrets and variables → Actions** values:

| Name | Purpose | Example |
| --- | --- | --- |
| `DOMAIN` | Application hostname | `firemail.pp.ua` |
| `JWT_SECRET` | Must match the Worker runtime `jwt_secret`; both Secrets and Variables are supported | Your configured secret |
| `NAME` (optional) | Worker name used to select the Cloudflare deployment check; defaults to `cloud-mail` | `cloud-mail` |
| `PRODUCTION_BRANCH` (optional) | Cloudflare production deployment branch; defaults to `send`. Other branches do not initialize production | `send` |
| `APP_URL` (optional) | Overrides `DOMAIN` when the application has a separate URL; legacy `CUSTOM_DOMAIN` also supported | `https://mail.example.com` |

Changes to application code on the production branch (default `send`) trigger initialization automatically. Cloudflare must deploy that branch to this application and allow the changed paths in its build watch configuration. Without a corresponding Cloudflare build, the workflow times out. New pushes cancel older initialization runs on the same branch. To rerun, open **Actions → Initialize cloud-mail after Cloudflare deployment → Run workflow** and select the production branch.

Initialization upgrades the database and refreshes cached settings without deploying Workers or creating resources. Temporary network/server errors are retried; mismatched secrets or responses other than `success` fail. GitHub variables are not synchronized to Cloudflare: the Actions `DOMAIN` locates the initialization endpoint, while the Worker runtime `domain` remains an array of email domains such as `["firemail.pp.ua"]`. Legacy Actions domain arrays use their first entry; set `APP_URL` when the application is hosted elsewhere.

If Cloudflare Access protects the application and Actions should require no additional credentials, open **Zero Trust → Access → Applications**. Create separate Self-hosted applications for the following paths, each with **Bypass → Include → Everyone**:

| Hostname | Path | Purpose |
| --- | --- | --- |
| Your application hostname | `deployment.json` | Public build commit identifier |
| Same hostname | `api/init/*` | Initialization; the application still verifies `JWT_SECRET` |

Keep the existing whole-site login policy, and create more specific applications for only these endpoints. Do not change the whole-site policy to Everyone. More specific paths use their own policy, as described in [Application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/) and [Bypass a public endpoint](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/common-policies/#bypass-a-public-endpoint). The workflow does not modify Access settings, and reports Access login redirects explicitly.

## Mailjet sending configuration

1. After deployment, Actions automatically calls `/api/init/<JWT_SECRET>` to add `mailjet_tokens` and refresh cached settings. The initialization workflow can also be rerun manually.
2. Verify the sender domain or address in Mailjet. In **System Settings → Email → Mailjet email sending**, select the sender domain and enter both **API Key** and **Secret Key**. Credentials are stored on the backend and masked in the configuration list.
3. Domains configured for Mailjet use it for external mail. Other domains continue to prefer Cloudflare Email, then Resend. Internal-only messages use local delivery. Save with both keys empty to remove a domain's Mailjet configuration.

Supports shared-recipient sending, separate messages, attachments, inline CID images and replies. Separate sending uses batches of at most 50 messages, with one message per recipient. Partial failures preserve successful records and leave failed or unsubmitted recipients available for retry. Accepted messages are marked as sent, rather than delivered.

Uses [Mailjet Send API v3.1](https://dev.mailjet.com/docs/email-api/send-api-v31/send-basic-email). [SandboxMode](https://dev.mailjet.com/docs/email-api/send-api-v31/sandbox.mode) validates real API requests without delivering mail. Run backend regression tests with `cd mail-worker && pnpm test:unit`.

## Project Structure

```
cloud-mail
├── mail-worker                    # Backend worker project
│   ├── src
│   │   ├── api                    # API layer
│   │   ├── const                  # Project constants
│   │   ├── dao                    # Data access layer
│   │   ├── email                  # Email processing and handling
│   │   ├── entity                 # Database entities
│   │   ├── error                  # Custom exceptions
│   │   ├── hono                   # Web framework, middleware, error handling
│   │   ├── i18n                   # Internationalization
│   │   ├── init                   # Database and cache initialization
│   │   ├── model                  # Response data models
│   │   ├── security               # Authentication and authorization
│   │   ├── service                # Business logic layer
│   │   ├── template               # Message templates
│   │   ├── utils                  # Utility functions
│   │   └── index.js               # Entry point
│   ├── package.json               # Project dependencies
│   └── wrangler.toml              # Project configuration
│
├── mail-vue                       # Frontend Vue project
│   ├── src
│   │   ├── axios                  # Axios configuration
│   │   ├── components             # Custom components
│   │   ├── echarts                # ECharts integration
│   │   ├── i18n                   # Internationalization
│   │   ├── init                   # Startup initialization
│   │   ├── layout                 # Main layout components
│   │   ├── perm                   # Permissions and access control
│   │   ├── request                # API request layer
│   │   ├── router                 # Router configuration
│   │   ├── store                  # Global state management
│   │   ├── utils                  # Utility functions
│   │   ├── views                  # Page components
│   │   ├── app.vue                # Root component
│   │   ├── main.js                # Entry JS file
│   │   └── style.css              # Global styles
│   ├── package.json               # Project dependencies
└── └── env.release                # Environment configuration

```

## License

This project is licensed under the [MIT](LICENSE) license.

## Communication

[Telegram](https://t.me/cloud_mail_tg)

# Cloud Mail API 集成指南 (Developer Guide)

本指南旨在帮助开发者通过 API 快速集成 Cloud Mail 的核心功能，实现自动化接码、邮件收发及账号管理。

---

## 🚀 核心配置
- **API Base URL**: `https://your-domain.com/api`
- **Auth Header**: `Authorization: <YOUR_TOKEN>`
- **Content-Type**: `application/json`

---

## 🔐 身份验证 (Authentication)

### 用户登录 (JWT 获取)
**接口**: `POST /login`
- **Payload**: `{ "email": "admin@example.com", "password": "your_password" }`
- **返回**: `data.token` (有效期 30 天)。
- **注意**: 建议在脚本中持久化缓存 Token，仅在返回 `401` 时重新登录，以节省 Cloudflare KV 写入额度。

### 公共 Token (适合长期自动化)
**接口**: `POST /public/genToken`
- **Payload**: `{ "email": "admin@example.com", "password": "your_password" }`
- **用途**: 生成一个 UUID 格式的长期 Token。在调用 `/public/` 开头的接口时，直接在 Header 中携带此 Token 即可绕过登录逻辑。

---

## 📧 邮件与账号管理 (Mailbox Operations)

### 1. 创建新邮箱账号
**接口**: `POST /account/add`
- **Payload**: `{ "email": "new_user@your-domain.com" }`
- **⚠️ 避坑**: 必须提供**完整的邮箱地址**（包含域名），且参数名必须为 `email`。

### 2. 获取邮件列表 (收件箱)
**接口**: `GET /email/list`
- **Query Params**:
  - `page`: 页码 (默认 1)
  - `size`: 每页数量
  - `accountId`: 可选，指定邮箱 ID
  - `type`: **必选** (0: 收件箱, 1: 已发送)
  - `emailId`: **必选** (分页游标，首页传 0)
- **⚠️ 避坑**: 缺少 `type` 或 `emailId` 会导致后端数据库查询报错 (500 D1_TYPE_ERROR)。

### 3. 发送邮件
**接口**: `POST /email/send`
- **Payload**:
  ```json
  {
    "from": "sender@your-domain.com",
    "receiveEmail": ["target@external.com"], 
    "subject": "Hello World",
    "content": "<h1>HTML内容</h1>",
    "text": "纯文本内容",
    "attachments": [] 
  }
  ```
- **⚠️ 避坑**:
  1. 接收方参数名是 **`receiveEmail`** (数组格式)，不是 `to`。
  2. 即使没有附件，也必须传 **`attachments: []`**。
  3. 必须提供 **`text`** 字段。

---

## 🛠 常见错误与注意事项 (Troubleshooting)

### 1. 为什么发送邮件返回 500 (D1_TYPE_ERROR)?
**已知 Bug**: 当前版本后端在执行 `orm().insert()` 保存已发送邮件时，若未自动生成 `messageId`，会触发数据库类型校验错误。这通常是后端逻辑缺陷，不代表你的请求参数有误。如果发送成功但返回 500，请检查接收方是否已收到邮件。

### 2. 为什么创建账号返回 "邮箱不能为空"?
请检查参数名。必须使用 `"email": "..."` 而不是 `"account": "..."`。

### 3. 如何实现高效接码？
推荐使用公共接口：`POST /api/public/emailList`。
- **Payload**: `{ "account": "target@your-domain.com" }`
- **Header**: `Authorization: <PUBLIC_TOKEN>`
- **优势**: 该接口只消耗 KV 读取额度，极大地降低了触发 Cloudflare 免费版封禁的风险。

---

## 📈 额度建议 (Cloudflare Free Tier)
- **KV 写入 (1000次/天)**: 登录和刷新 Token 会消耗此额度。请务必复用 Token。
- **D1 写入 (9.5万次/天)**: 邮件收发、账号增删主要消耗此额度，通常非常充足。

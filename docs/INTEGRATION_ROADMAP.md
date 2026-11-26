# XPass HQ — Integration Roadmap (cloud-mail)

**Repository:** `cloud-mail` (IS XPass HQ — NOT xpass-crm-lab)
**DeskcommCRM:** Reference only, read-only, at `xpass-crm-lab` (MIT license)
**Goal:** Extend existing XPass HQ with CRM, WhatsApp, Finance, Tasks, Calendar, Documents, Notes, AI, Automations — natively inside cloud-mail, sharing one login, one navigation, one design system, one permission system.

---

## 1. Architecture principles (non-negotiable)

| Rule | Meaning |
|------|---------|
| One login | Existing JWT/auth in cloud-mail is the only auth. No second login. |
| Preserve existing | Mail, overview, analytics, settings, users, roles — untouched. |
| Additive only | New D1 tables via additive migrations (ALTER TABLE ADD COLUMN, CREATE TABLE IF NOT EXISTS). No destructive changes. |
| Backend-enforced permissions | Every new API route gated by `requirePerms` + `premKey` in `security.js`; frontend `v-perm` / `hasPerm` for UI. |
| Vue design system | Element Plus + existing CSS variables (`--hq-*`). No Next.js, no Tailwind, no shadcn. |
| No mandatory Supabase | D1 + drizzle-orm is the database. Supabase is NOT added. |
| MIT attribution | DeskcommCRM patterns adapted with attribution where code is derived. |
| No deploy/push/merge | Local development only. |

---

## 2. Target sidebar (from user prompt)

| Module | Status | Existing in cloud-mail? |
|--------|--------|-------------------------|
| Overview | ✓ Done | `views/hq/overview.vue`, route `/overview` |
| Mail | ✓ Done | `views/email/`, route `/inbox`, `/mail`, `/sent`, `/drafts`, `/starred` |
| WhatsApp | 🔲 New | — |
| CRM | 🔲 New (this phase) | `modules/registry.js` has `crm` stub (`available: false`) |
| Finance | 🔲 New | — |
| Tasks and Requests | 🔲 New | `tasks` stub exists in DeskcommCRM ref; not in cloud-mail |
| Calendar | 🔲 New | `calendar` stub exists in DeskcommCRM ref; not in cloud-mail |
| Documents | 🔲 New | `documents` stub (`available: false`) in registry |
| Notes | 🔲 New | — |
| AI | 🔲 New | `ai-service.js` exists ( Workers AI verification-code) |
| Automations | 🔲 New | — |
| Analytics | ✓ Done | `views/analysis/`, route `/dashboard`, perm `analysis:query` |
| Administration | ✓ Done | `views/user/`, `views/role/`, `views/sys-setting/`, `views/reg-key/` |
| Settings | ✓ Done | `views/setting/`, route `/settings` |

---

## 3. Existing infrastructure to reuse

### Backend (mail-worker)
- **Router:** `src/hono/hono.js` (Hono), routes registered in `src/hono/webs.js`
- **Auth middleware:** `src/security/security.js` — JWT verify + `requirePerms` path gating + `premKey` perm-to-path mapping
- **User context:** `src/security/user-context.js` — `getUserId(c)`, `getUser(c)`
- **ORM:** `src/entity/orm.js` — drizzle over D1 (`c.env.db`)
- **Entities:** `src/entity/*.js` — drizzle `sqliteTable` definitions
- **Response wrapper:** `src/model/result.js` — `result.ok(data)`, `result.fail(msg, code)`
- **Error:** `src/error/biz-error.js`
- **Migrations:** `src/init/init.js` — additive SQL versioned functions (`intDB`, `v1_1`…`v3_8`)
- **KV:** auth tokens stored in `c.env.kv`, `KvConst` in `src/const/kv-const.js`

### Frontend (mail-vue)
- **Router:** `src/router/index.js` — Vue Router, `meta.menu` controls sidebar visibility
- **Permissions:** `src/perm/perm.js` — `v-perm` directive, `hasPerm(key)`, `permsToRouter(keys)`, `routers` map of permKey → route definitions
- **Module registry:** `src/modules/registry.js` — `workspaceModules` array (`id`, `name`, `icon`, `available`, `routeName`, `routeNames`, `requiredPermission`)
- **Sidebar:** `src/layout/aside/index.vue` — renders `primaryModules` (available + has perm), `futureModules` (not available), `adminLinks`
- **API client:** `src/axios/index.js` — axios with `Authorization` header from `localStorage.token`, response interceptor handles 401/403/502
- **Request layer:** `src/request/*.js` — thin wrappers over `http`
- **Stores:** Pinia stores in `src/store/` (user, role, setting, ui, account, email, draft, send, writer)
- **i18n:** `src/i18n/en.js` (English), `vue-i18n`

---

## 4. CRM — Phase 1: Native foundation (immediate)

### 4.1 Database (D1, additive migration)

New tables (add to `init.js` as `v3_9DB`):

| Table | Columns | Purpose |
|-------|---------|---------|
| `crm_contacts` | id, user_id, name, email, phone, company_id, address, notes, tags (json), source, create_time, update_time, is_del | People — connected to email records |
| `crm_companies` | id, user_id, name, domain, industry, address, phone, website, notes, create_time, update_time, is_del | Organizations |
| `crm_pipelines` | id, user_id, name, slug, description, position, create_time, update_time, is_del | Sales funnels |
| `crm_stages` | id, pipeline_id, name, slug, position, color, is_won, is_lost, create_time, update_time, is_del | Pipeline stages |
| `crm_deals` | id, user_id, pipeline_id, stage_id, contact_id, company_id, title, value_cents, currency, status, expected_close_date, create_time, update_time, is_del | Opportunities |
| `crm_tasks` | id, user_id, deal_id, contact_id, title, description, status, priority, due_at, assigned_to, create_time, update_time, is_del | Tasks linked to deals/contacts |

All tables: `user_id` for tenancy (maps to cloud-mail `user.user_id`), `is_del` soft delete, `create_time`/`update_time` timestamps. No `organization_id` — cloud-mail uses `user_id` as the tenant boundary.

### 4.2 Backend permissions

Add to `security.js`:
- `requirePerms`: new paths (`/crm/contacts`, `/crm/companies`, `/crm/pipelines`, `/crm/stages`, `/crm/deals`, `/crm/tasks`)
- `premKey`: new perm keys (`contacts:query`, `contacts:add`, `contacts:edit`, `contacts:delete`, `companies:query`, `companies:add`, `companies:edit`, `companies:delete`, `pipelines:query`, `pipelines:add`, `pipelines:edit`, `pipelines:delete`, `deals:query`, `deals:add`, `deals:edit`, `deals:delete`, `tasks:query`, `tasks:add`, `tasks:edit`, `tasks:delete`)

Add perm seed data to `init.js` `v1_1DB` perm INSERT (or new migration) — mirroring existing perm structure with `pid` hierarchy.

### 4.3 Backend API routes

New files in `src/api/`:
- `contacts-api.js` — `GET /crm/contacts`, `POST /crm/contacts`, `PUT /crm/contacts/:id`, `DELETE /crm/contacts/:id`
- `companies-api.js` — `GET /crm/companies`, `POST /crm/companies`, `PUT /crm/companies/:id`, `DELETE /crm/companies/:id`
- `pipelines-api.js` — `GET /crm/pipelines`, `POST /crm/pipelines`, `PUT /crm/pipelines/:id`, `DELETE /crm/pipelines/:id`
- `stages-api.js` — `GET /crm/stages`, `POST /crm/stages`, `PUT /crm/stages/:id`, `DELETE /crm/stages/:id`
- `deals-api.js` — `GET /crm/deals`, `POST /crm/deals`, `PUT /crm/deals/:id`, `DELETE /crm/deals/:id`
- `tasks-api.js` — `GET /crm/tasks`, `POST /crm/tasks`, `PUT /crm/tasks/:id`, `DELETE /crm/tasks/:id`

Each route: `userContext.getUserId(c)` for tenancy, `c.env.db.prepare()` or `orm(c)` for D1 queries, `result.ok()` / `result.fail()` responses.

Register in `src/hono/webs.js`.

### 4.4 Frontend module registration

`src/modules/registry.js`: set `crm.available = true`, `crm.routeName = 'crm-contacts'`, `crm.routeNames = ['crm-contacts','crm-contact','crm-companies','crm-pipelines','crm-deals','crm-tasks']`, `crm.requiredPermission = 'contacts:query'`.

### 4.5 Frontend routes

`src/router/index.js`: add CRM routes with `meta: { title, name, menu: true }`.

### 4.6 Frontend permissions

`src/perm/perm.js`: add CRM perm keys to `routers` map with route definitions.

### 4.7 Frontend views

New files in `src/views/crm/`:
- `index.vue` — contacts list (table with search, add button)
- `[id].vue` — contact detail (linked emails, deals, tasks)
- `companies.vue` — companies list
- `pipelines.vue` — pipeline/kanban board (stages as columns, deals as cards)
- `deals.vue` — deals list
- `tasks.vue` — tasks list

Use Element Plus components (`el-table`, `el-dialog`, `el-form`, `el-button`, `el-input`, `el-select`) matching existing design system. CSS variables `--hq-*` from `style.css`.

### 4.8 Frontend API requests

New files in `src/request/`:
- `contacts.js` — `contactsList(params)`, `contactsCreate(data)`, `contactsUpdate(id, data)`, `contactsDelete(id)`
- `companies.js`, `pipelines.js`, `deals.js`, `tasks.js` — same pattern

---

## 5. Future phases (after CRM foundation)

| Phase | Modules | Backend tables | Backend API | Frontend views |
|-------|---------|---------------|-------------|----------------|
| 2 | Finance | `finance_accounts`, `finance_transactions`, `finance_invoices` | `/finance/*` | `views/finance/` |
| 3 | Tasks & Requests | `crm_tasks` (extend), `support_requests` | `/tasks/*`, `/requests/*` | `views/tasks/`, `views/requests/` |
| 4 | Calendar | `calendar_events` | `/calendar/*` | `views/calendar/` |
| 5 | Documents | `documents`, `document_folders` | `/documents/*` | `views/documents/` |
| 6 | Notes | `notes` | `/notes/*` | `views/notes/` |
| 7 | WhatsApp | `whatsapp_conversations`, `whatsapp_messages` | `/whatsapp/*` | `views/whatsapp/` |
| 8 | AI | (existing `ai-service.js`) | `/ai/*` | `views/ai/` |
| 9 | Automations | `automation_rules` | `/automations/*` | `views/automations/` |
| 10 | Finance (Paystack) | Paystack webhook/events | `/paystack/*` | — |

---

## 6. WhatsApp safety rules (from user prompt)

- One official XPass WhatsApp business number
- AI provides suggested replies ONLY — never independently sends
- Human must explicitly click Send
- Bulk messaging: authorization + consent + templates + provider compliance
- All enforced on backend

---

## 7. Finance rules (from user prompt)

- Financial records, reconciliation, approval workflows
- Paystack integration readiness (credentials later, never hardcoded)
- Per-module/per-action permissions (view-only / editable / approval-only)
- Backend enforcement

---

## 8. File change inventory (CRM Phase 1)

### mail-worker (backend)
1. `src/init/init.js` — `v3_9DB`: CREATE TABLE for 6 CRM tables + perm seed inserts
2. `src/entity/crm-contact.js` — drizzle entity (new)
3. `src/entity/crm-company.js` — drizzle entity (new)
4. `src/entity/crm-pipeline.js` — drizzle entity (new)
5. `src/entity/crm-stage.js` — drizzle entity (new)
6. `src/entity/crm-deal.js` — drizzle entity (new)
7. `src/entity/crm-task.js` — drizzle entity (new)
8. `src/api/contacts-api.js` — new
9. `src/api/companies-api.js` — new
10. `src/api/pipelines-api.js` — new
11. `src/api/stages-api.js` — new
12. `src/api/deals-api.js` — new
13. `src/api/tasks-api.js` — new
14. `src/security/security.js` — add requirePerms + premKey entries
15. `src/hono/webs.js` — import new API files

### mail-vue (frontend)
16. `src/modules/registry.js` — crm.available = true, route info
17. `src/router/index.js` — CRM routes
18. `src/perm/perm.js` — CRM perm keys + routers entries
19. `src/request/contacts.js` — new
20. `src/request/companies.js` — new
21. `src/request/pipelines.js` — new
22. `src/request/stages.js` — new
23. `src/request/deals.js` — new
24. `src/request/tasks.js` — new
25. `src/views/crm/index.vue` — contacts list (new)
26. `src/views/crm/[id].vue` — contact detail (new)
27. `src/views/crm/companies.vue` — companies list (new)
28. `src/views/crm/pipelines.vue` — pipeline board (new)
29. `src/views/crm/deals.vue` — deals list (new)
30. `src/views/crm/tasks.vue` — tasks list (new)

---

## 9. Verification checklist

- [ ] `pnpm --dir mail-worker dev` starts on `127.0.0.1:8787`
- [ ] `pnpm --dir mail-vue dev` starts on `http://localhost:3001`
- [ ] Login with `admin@example.com` (from `init:local`) works
- [ ] CRM appears in sidebar (after perm granted)
- [ ] CRM routes load under same authenticated session as Mail
- [ ] Mail (inbox, send, drafts) still works after CRM added
- [ ] Permission gating: user without `contacts:query` cannot see CRM
- [ ] Backend returns 403 for CRM API calls without proper perm
- [ ] D1 migration applies cleanly (`init:local`)
- [ ] No existing tables/columns modified (additive only)

---

## 10. Attribution

DeskcommCRM (MIT, Rafael Melgaço, github.com/melgarafael/DeskcommCRM) is a reference for CRM data model, pipeline/kanban patterns, task patterns, and permission gating patterns. Patterns adapted to cloud-mail's Vue3 + Cloudflare Workers + D1 stack. No code copied verbatim without attribution. DeskcommCRM remains unmodified at `xpass-crm-lab`.

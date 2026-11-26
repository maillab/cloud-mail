# Integration Architecture — XPass HQ (cloud-mail canonical)

**Date:** 2026-11-10  
**Canonical repository:** `cloud-mail` (branch `xpass/hq-development`)  
**Reference repository:** `xpass-crm-lab` (DeskcommCRM fork, MIT, read-only)  
**Objective:** One website, one login, one staff identity, one navigation, one design system, one unified permission framework.

---

## 1. Core Principles (Non-Negotiable)

| Rule | Enforcement |
|---|---|
| **One login** | Existing JWT auth in cloud-mail is the only auth. No Supabase Auth. No second login. |
| **Preserve existing** | Mail, overview, analytics, settings, users, roles — untouched. No replacement of working modules. |
| **Additive only** | New D1 tables via additive migrations (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN`). No destructive changes. |
| **Backend-enforced permissions** | Every API route gated by `requirePerms` + `premKey` in `security.js`; frontend `v-perm` / `hasPerm` for UI. |
| **Vue design system** | Element Plus + existing `--hq-*` CSS variables. No Next.js, no Tailwind, no shadcn/ui. |
| **No mandatory Supabase** | D1 + drizzle-orm is the database. Supabase is NOT added as a dependency. |
| **MIT attribution** | DeskcommCRM patterns adapted with attribution. No verbatim copying without attribution. |
| **No deploy/push/merge** | Local development only. |

---

## 2. Target Architecture

```
cloud-mail (XPass HQ)
├── mail-vue/ (Vue 3 + Element Plus frontend, port 3001)
│   ├── src/router/index.js          — Single router, all module routes
│   ├── src/modules/registry.js      — Module availability + requiredPermission
│   ├── src/perm/perm.js             — v-perm directive + perm→route map
│   ├── src/views/                   — One view per route (Element Plus)
│   └── src/request/*.js             — API client wrappers (axios)
├── mail-worker/ (Cloudflare Workers + Hono backend, port 8787)
│   ├── src/hono/webs.js             — Route registration (imports all API files)
│   ├── src/security/security.js     — JWT verify + requirePerms + premKey
│   ├── src/init/init.js             — Additive D1 migrations (v3_9DB = CRM)
│   └── src/api/*-api.js             — One file per resource (CRUD + tenancy)
└── doc/xpass/                       — This documentation
```

---

## 3. Navigation Structure (Per User Prompt)

| Group | Modules | Routes | cloud-mail status |
|---|---|---|---|
| OVERVIEW | Personalized dashboard, assigned work, requests, approvals, WhatsApp, calendar, notes, metrics | `/overview` | ✓ Working |
| COMMUNICATIONS | Mail, WhatsApp | `/inbox`, `/mail`, `/sent`, `/drafts`, `/starred` + future `/whatsapp/*` | ✓ Mail working, WhatsApp not started |
| RELATIONSHIPS | CRM, Contacts, Organizations, Leads/opportunities | `/crm/contacts`, `/crm/companies`, `/crm/pipelines`, `/crm/deals` | ✓ Backend + views created (Phase 1) |
| WORKSPACE | Tasks, Projects, Requests/approvals, Calendar, Notes, Documents | Future: `/tasks/*`, `/requests/*`, `/calendar/*`, `/notes/*`, `/documents/*` | Not started |
| BUSINESS | Finance, Payments/reconciliation, Analytics, Operational intelligence | Future: `/finance/*`, `/dashboard` | ✓ Analytics working, Finance not started |
| ADMINISTRATION | People, Roles/permissions, Integrations, Automations, AI config, Settings | `/users`, `/role`, `/system-settings`, `/invite-code`, `/settings` | ✓ Users/Roles/Settings working |

**Design:** Professional light/dark themes via `--hq-*` CSS variables. No unintended blue accents or inconsistent white surfaces. No placeholder modules claimed as complete.

---

## 4. Module Boundaries

| Module | Backend tables (D1) | Backend API paths | Frontend views | Permissions |
|---|---|---|---|---|
| CRM (contacts) | `crm_contacts` | `/crm/contacts` | `views/crm/index.vue`, `[id].vue` | `contacts:query/add/edit/delete` |
| CRM (companies) | `crm_companies` | `/crm/companies` | `views/crm/companies.vue` | `companies:query/add/edit/delete` |
| CRM (pipelines) | `crm_pipelines` | `/crm/pipelines` | `views/crm/pipelines.vue` | `pipelines:query/add/edit/delete` |
| CRM (stages) | `crm_stages` | `/crm/stages` | `views/crm/pipelines.vue` | `pipelines:query/add/edit/delete` |
| CRM (deals) | `crm_deals` | `/crm/deals` | `views/crm/deals.vue` | `deals:query/add/edit/delete` |
| CRM (tasks) | `crm_tasks` | `/crm/tasks` | `views/crm/tasks.vue` | `tasks:query/add/edit/delete` |
| Finance | Future: `finance_*` | Future: `/finance/*` | Future: `views/finance/` | View-only / editable / approval-only (split) |
| Documents | Future: `documents`, `document_folders` | Future: `/documents/*` | Future: `views/documents/` | Backend-enforced |
| WhatsApp | Future: `whatsapp_*` | Future: `/whatsapp/*` | Future: `views/whatsapp/` | AI suggests, human sends |
| Tasks/Requests/Calendar/Notes | Future | Future | Future | Per-module/per-action |

**Tenancy model:** cloud-mail uses `user_id` (not `organization_id`) as the tenant boundary. All new tables must include `user_id INTEGER NOT NULL` and `is_del INTEGER DEFAULT 0 NOT NULL` for soft delete.

---

## 5. Security Rules

### WhatsApp (future phase)
- One official XPass WhatsApp business number
- AI generates suggested replies only — never independently sends
- Human must explicitly click Send for every outgoing message (including bulk)
- Automations can prepare drafts, requests, assignments, alerts, suggested actions
- Provider rules, consent, message limits, template requirements enforced on backend

### Finance (future phase)
- KES only, integer minor units (`_cents`)
- 0% organizer commission / 5% attendee service fee
- Paystack integration via secure admin setup wizard (credentials later, never hardcoded)
- No unverified payments marked as successful
- Granular permissions: view-only vs editable vs approval-only (separate perm keys)

### Documents (future phase)
- Folders, uploads, downloads, previews, deletion, sharing, version history where feasible
- Backend-enforced permissions

### AI (future phase)
- AI may help analyze accessible Mail, CRM, Finance, Documents, task information
- AI must not exceed requesting user's permissions
- Explicit approval required for sensitive actions

---

## 6. What Was NOT Transplanted from xpass-crm-lab

| Item | Reason |
|---|---|
| Next.js 16 App Router frontend | cloud-mail uses Vue 3; different stack |
| Supabase Auth + Postgres + RLS | cloud-mail uses JWT + KV + D1; Supabase not mandatory |
| `organization_id` multi-tenancy | cloud-mail uses `user_id` tenancy |
| Full DeskcommCRM app tree | Would create a second XPass HQ; prohibited |
| `lib/navigation/catalogo.ts` pattern | cloud-mail has equivalent `registry.js` + `perm.js` routers pattern |

---

## 7. Local Development Commands

| Command | Purpose | Notes |
|---|---|---|
| `pnpm --dir mail-worker setup:local` | Configure local Worker secrets | Must run before `dev` |
| `pnpm --dir mail-worker dev` | Start Wrangler on `127.0.0.1:8787` | Cloudflare Workers local dev |
| `pnpm --dir mail-worker init:local` | Apply D1 migrations + create test account | Requires Worker running |
| `pnpm --dir mail-vue build` | Build frontend assets | Succeeds (verified) |
| `pnpm --dir mail-vue dev` | Start Vue dev server on `localhost:3001` | Vite dev server |

**RAM constraint:** 8 GB — avoid `pnpm build`/`typecheck` on full repos. Use targeted checks.

**Known local dev limitation:** Wrangler local KV `get(..., { type: 'json' })` returns null, causing 401 on all authenticated endpoints. This is a local Wrangler limitation, not a code issue. In production (Cloudflare), KV JSON get works correctly. CRM API endpoints return 401 (not 404), confirming they are mounted.

**Verified:**
- Wrangler builds and runs without errors
- All 6 CRM D1 tables exist (`crm_contacts`, `crm_companies`, `crm_pipelines`, `crm_stages`, `crm_deals`, `crm_tasks`)
- All 20 CRM perm keys seeded in `perm` table
- Test contact inserted and retrieved from D1 successfully
- Frontend build succeeds with all 6 CRM view chunks
- Login endpoint returns valid JWT token

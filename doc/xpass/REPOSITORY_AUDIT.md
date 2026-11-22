# Repository Audit — XPass HQ

**Date:** 2026-11-10  
**Auditor:** Kilo (automated)  
**Purpose:** Establish which repository contains what, before any further development.

---

## 1. Repository Summary

| Attribute | cloud-mail | xpass-crm-lab |
|---|---|---|
| Absolute path | `C:\Users\Rodney\Documents\XPass-Development\cloud-mail` | `C:\Users\Rodney\Documents\XPass-Development\xpass-crm-lab` |
| Git root | Same as path | Same as path |
| Current branch | `xpass/hq-development` | `feat/xpass-hq-build001` |
| Latest commit SHA | `98b1ee7` | `c1ecc8d21` |
| Latest commit message | `deployment: require manual approval and isolate database changes` | `Merge pull request #3276 from paulolimajr77/feat/banco-externo-r4-imagem-no-envio` |
| Remote URL | `https://github.com/Rodneyfromda0/cloud-mail.git` | `https://github.com/melgarafael/DeskcommCRM.git` |
| Role | **Canonical XPass HQ** | Reference (DeskcommCRM fork, MIT licensed) |
| Modified tracked files | 14 | 1 |
| Untracked files/dirs | 14 | 3 |
| Worktrees | 1 (main) + 1 Kilo pool | 1 (main) |

---

## 2. cloud-mail — Detailed State

### 2.1 Modified tracked files (14)

| File | Change type |
|---|---|
| `mail-vue/src/App.vue` | Modified |
| `mail-vue/src/i18n/en.js` | Modified |
| `mail-vue/src/i18n/zh.js` | Modified |
| `mail-vue/src/layout/index.vue` | Modified |
| `mail-vue/src/main.js` | Modified |
| `mail-vue/src/modules/registry.js` | Modified — `crm.available = true` |
| `mail-vue/src/perm/perm.js` | Modified — CRM perm keys added to `routers` |
| `mail-vue/src/router/index.js` | Modified — CRM routes added |
| `mail-vue/src/style.css` | Modified |
| `mail-vue/src/views/analysis/index.vue` | Modified |
| `mail-vue/src/views/setting/index.vue` | Modified |
| `mail-vue/src/views/user/index.vue` | Modified |
| `mail-worker/src/hono/webs.js` | Modified — CRM API imports registered |
| `mail-worker/src/init/init.js` | Modified — `v3_9DB` CRM migration added |

### 2.2 Untracked files/directories (14)

**Backend API (new):**
- `mail-worker/src/api/contacts-api.js`
- `mail-worker/src/api/companies-api.js`
- `mail-worker/src/api/pipelines-api.js`
- `mail-worker/src/api/stages-api.js`
- `mail-worker/src/api/deals-api.js`
- `mail-worker/src/api/tasks-api.js`

**Frontend request layer (new):**
- `mail-vue/src/request/contacts.js`
- `mail-vue/src/request/companies.js`
- `mail-vue/src/request/pipelines.js`
- `mail-vue/src/request/stages.js`
- `mail-vue/src/request/deals.js`
- `mail-vue/src/request/tasks.js`

**Frontend views (new):**
- `mail-vue/src/views/crm/index.vue`
- `mail-vue/src/views/crm/[id].vue`
- `mail-vue/src/views/crm/companies.vue`
- `mail-vue/src/views/crm/pipelines.vue`
- `mail-vue/src/views/crm/deals.vue`
- `mail-vue/src/views/crm/tasks.vue`

**Docs (new):**
- `docs/INTEGRATION_ROADMAP.md`

### 2.3 Architecture

- **Frontend:** Vue 3 + Element Plus + Vite, dev server on `localhost:3001`
- **Backend:** Cloudflare Workers + Hono + D1 (SQLite), dev on `127.0.0.1:8787`
- **Auth:** JWT (`jwt_secret`), tokens stored in KV (`auth-uid:<userId>`)
- **Permissions:** `requirePerms` path list + `premKey` perm-to-path mapping in `security.js`; frontend `v-perm` directive + `hasPerm()` helper
- **Migrations:** Additive versioned functions in `mail-worker/src/init/init.js` (`intDB`, `v1_1`…`v3_8`, plus `v3_9DB` for CRM)
- **ORM:** Drizzle over D1 (`c.env.db`)
- **Response wrapper:** `result.ok()` / `result.fail()`
- **Tenancy:** `user_id` on all tenant-aware tables (cloud-mail uses `user_id`, not `organization_id`)

### 2.4 Existing modules (implemented before CRM work)

| Module | Status | Location |
|---|---|---|
| Overview / Dashboard | Working | `mail-vue/src/views/hq/overview.vue`, route `/overview` |
| Mail | Working | `mail-vue/src/views/email/`, routes `/inbox`, `/mail`, `/sent`, `/drafts`, `/starred` |
| Analytics | Working | `mail-vue/src/views/analysis/index.vue`, route `/dashboard` |
| Administration (Users, Roles, Reg-keys) | Working | `mail-vue/src/views/user/`, `views/role/`, `views/reg-key/` |
| Settings | Working | `mail-vue/src/views/setting/index.vue`, route `/settings` |
| CRM | Partial (Phase 1 done) | Backend API + frontend views created, D1 tables created, not end-to-end verified locally |

---

## 3. xpass-crm-lab — Detailed State

### 3.1 Modified tracked files (1)

| File | Change type |
|---|---|
| `lib/navigation/catalogo.ts` | Modified — added `/app/documentos` nav entry |

### 3.2 Untracked files/directories (3)

| Path | Type |
|---|---|
| `app/app/documentos/` | New directory (documents page) |
| `docs/xpass/` | New directory (5 architecture docs) |
| `supabase/migrations/20261110150000_9316_documentos.sql` | New migration (document_folders + documents tables, RLS, storage bucket) |

### 3.3 Architecture (DeskcommCRM base)

- **Frontend:** Next.js 16 App Router (Turbopack), React 19, TypeScript 6 strict, Tailwind 4, shadcn/ui
- **Backend:** Supabase (Postgres + RLS + vector + Realtime + Storage), Supabase Auth
- **WhatsApp:** WAHA Plus (NOWEB) + Meta Cloud API
- **AI:** Vercel AI SDK v7, per-tenant RAG
- **Tenancy:** `organization_id uuid` on all tenant tables, RLS via `fn_user_org_ids()`
- **RBAC:** viewer(1) < agent(2) < manager(3) < admin(4) + platform admin
- **Dev URL:** `http://localhost:3000`
- **RAM constraint:** 8 GB — full `pnpm build`/`typecheck`/`lint` cannot run (OOM)

### 3.4 Existing DeskcommCRM capabilities (inherited, NOT built in this sprint)

| Capability | Status in xpass-crm-lab | Notes |
|---|---|---|
| WhatsApp conversations/inbox | EXISTS | WAHA + Meta Cloud API |
| CRM: pipelines, kanban, contacts, companies, leads | EXISTS | Base DeskcommCRM |
| Tasks | EXISTS | Base DeskcommCRM |
| AI assistant (agents, knowledge, memory, skills, flows) | EXISTS | Vercel AI SDK v7 |
| Analytics (metrics, faturamento, honorarios, activities) | EXISTS | Base DeskcommCRM |
| Automations (automation-rules, cron, event_log) | EXISTS | Base DeskcommCRM |
| Finance (comandas, faturamento, honorarios) | EXISTS | BRL-oriented, NOT KES |
| Documents module | Slice 1 DONE | New tables + page + nav entry |
| Mail | NOT integrated | cloud-mail is separate repo |

### 3.5 Key architectural divergence (why both repos appeared in development)

The previous `ARCHITECTURE_DECISION.md` (in xpass-crm-lab) stated: "Work ONLY in `xpass-crm-lab`; cloud-mail NOT modified" and positioned cloud-mail as "Separate sub-app mounted read-only until verified." This contradicts the current directive, which establishes cloud-mail as the canonical XPass HQ and xpass-crm-lab as reference-only. All new development must happen in cloud-mail.

---

## 4. Kilo Worktree Pool

| Path | Branch | State |
|---|---|---|
| `C:\Users\Rodney\.local\share\kilo\worktree-pool\cloud-mail-38d692ed6f53\scarlet-wall` | `2f9334d` (detached HEAD) | Kilo-managed worktree |

---

## 5. Most Recent Kilo Changes

The most recent Kilo changes were made in **cloud-mail** (branch `xpass/hq-development` @ `98b1ee7`), specifically:
- CRM Phase 1 backend (6 API files, migration `v3_9DB`, security permissions)
- CRM Phase 1 frontend (6 views, 6 request files, registry, router, perm entries)
- `docs/INTEGRATION_ROADMAP.md`

No changes were committed to xpass-crm-lab beyond the Documents Slice 1 work (also uncommitted).

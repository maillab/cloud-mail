# Recovered Work — XPass HQ

**Date:** 2026-11-10  
**Source:** cloud-mail (branch `xpass/hq-development` @ `98b1ee7`) and xpass-crm-lab (branch `feat/xpass-hq-build001` @ `c1ecc8d21`)  
**Status:** All work preserved. Nothing deleted, reset, or overwritten.

---

## 1. Work Preserved in cloud-mail

All uncommitted changes in cloud-mail are preserved on branch `xpass/hq-development`. No commits, pushes, or merges were made.

### Backend (mail-worker)

| File | Status | Description |
|---|---|---|
| `src/init/init.js` | Modified | `v3_9DB`: CREATE TABLE IF NOT EXISTS for `crm_contacts`, `crm_companies`, `crm_pipelines`, `crm_stages`, `crm_deals`, `crm_tasks` + CRM perm seed inserts |
| `src/security/security.js` | Modified | Added CRM paths to `requirePerms` and CRM perm keys to `premKey` mapping |
| `src/hono/webs.js` | Modified | Imports for all 6 CRM API files registered |
| `src/api/contacts-api.js` | New | `GET/POST/PUT/DELETE /crm/contacts` with user_id tenancy |
| `src/api/companies-api.js` | New | `GET/POST/PUT/DELETE /crm/companies` |
| `src/api/pipelines-api.js` | New | `GET/POST/PUT/DELETE /crm/pipelines` |
| `src/api/stages-api.js` | New | `GET/POST/PUT/DELETE /crm/stages` |
| `src/api/deals-api.js` | New | `GET/POST/PUT/DELETE /crm/deals` |
| `src/api/tasks-api.js` | New | `GET/POST/PUT/DELETE /crm/tasks` |

**Note:** The roadmap referenced 6 drizzle entity files (`src/entity/crm-contact.js` etc.) but they were **never created**. Only raw SQL via `c.env.db.prepare()` is used in the API files.

### Frontend (mail-vue)

| File | Status | Description |
|---|---|---|
| `src/modules/registry.js` | Modified | `crm.available = true`, route info set |
| `src/router/index.js` | Modified | 6 CRM routes added |
| `src/perm/perm.js` | Modified | CRM perm keys added to `routers` map |
| `src/request/contacts.js` | New | contacts API client |
| `src/request/companies.js` | New | companies API client |
| `src/request/pipelines.js` | New | pipelines API client |
| `src/request/stages.js` | New | stages API client |
| `src/request/deals.js` | New | deals API client |
| `src/request/tasks.js` | New | tasks API client |
| `src/views/crm/index.vue` | New | Contacts list view |
| `src/views/crm/[id].vue` | New | Contact detail view |
| `src/views/crm/companies.vue` | New | Companies list view |
| `src/views/crm/pipelines.vue` | New | Pipeline/kanban board view |
| `src/views/crm/deals.vue` | New | Deals list view |
| `src/views/crm/tasks.vue` | New | Tasks list view |

### Documentation

| File | Status | Description |
|---|---|---|
| `docs/INTEGRATION_ROADMAP.md` | New | Full roadmap: principles, target sidebar, CRM Phase 1 plan, future phases, file inventory, verification checklist, attribution |

---

## 2. Work Preserved in xpass-crm-lab

All uncommitted changes in xpass-crm-lab are preserved on branch `feat/xpass-hq-build001`. This repository is reference-only; no new development should target it.

| File | Status | Description |
|---|---|---|
| `lib/navigation/catalogo.ts` | Modified | Added `/app/documentos` nav entry |
| `app/app/documentos/page.tsx` | New | Documents page (Server Component) |
| `supabase/migrations/20261110150000_9316_documentos.sql` | New | `document_folders` + `documents` tables, RLS org-scoped, storage bucket `documents` |
| `docs/xpass/ARCHITECTURE_DECISION.md` | New | Architecture decision record |
| `docs/xpass/BUILD_PROGRESS.md` | New | Chronological build log |
| `docs/xpass/IMPLEMENTATION_STATUS.md` | New | Feature implementation status |
| `docs/xpass/LOCAL_DEVELOPMENT.md` | New | Local dev guide |
| `docs/xpass/NEXT_IMPLEMENTATION_PHASE.md` | New | Next steps plan |

---

## 3. What Was NOT Created (Gaps in cloud-mail CRM Phase 1)

| Item | Referenced in roadmap | Actual status |
|---|---|---|
| `src/entity/crm-contact.js` | Listed (item 2) | **Not created** |
| `src/entity/crm-company.js` | Listed (item 3) | **Not created** |
| `src/entity/crm-pipeline.js` | Listed (item 4) | **Not created** |
| `src/entity/crm-stage.js` | Listed (item 5) | **Not created** |
| `src/entity/crm-deal.js` | Listed (item 6) | **Not created** |
| `src/entity/crm-task.js` | Listed (item 7) | **Not created** |
| End-to-end local verification | Planned | **Blocked** — KV `get(..., { type: 'json' })` returns null in Wrangler local dev, causing 401 on all authenticated endpoints |
| Frontend dev server verification | Planned | Not completed (server started but auth flow not tested end-to-end) |

---

## 4. Reusable Patterns from xpass-crm-lab (for adaptation to cloud-mail)

| Pattern | Source | Adaptation notes |
|---|---|---|
| Documents module (folders + files, RLS org-scoped) | `supabase/migrations/20261110150000_9316_documentos.sql` | Adapt to D1 additive migration: `documents`, `document_folders` with `user_id` tenancy |
| Navigation catalog (single source of truth for routes) | `lib/navigation/catalogo.ts` | cloud-mail already has `registry.js` + `perm.js` routers pattern — different but equivalent |
| Finance `_cents` + `currency` convention | Base DeskcommCRM `lib/financeiro/` | Already adopted in cloud-mail CRM `crm_deals.value_cents` + `currency DEFAULT 'KES'` |
| WhatsApp AI safety (human must click Send) | Base DeskcommCRM + `ARCHITECTURE_DECISION.md` | Applies directly to cloud-mail WhatsApp phase |
| Multi-module permission gating | Base DeskcommCRM RBAC | cloud-mail already has `requirePerms`/`premKey` — extend with view-only/edit/approval splits |

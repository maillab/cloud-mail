# CRM Continuation Plan — XPass HQ

**Date:** 2026-11-11  
**Repository:** cloud-mail (branch `xpass/hq-development`)  
**Status:** Gate 0 complete, ready for Gate 1

---

## Gate 0 — COMPLETE (Forensic Audit & Error Repair)

### What was fixed
1. **Runtime crash**: All CRM views accessed `contactsResp.data.list` but the axios interceptor (`mail-vue/src/axios/index.js:68`) unwraps `data.data`, so the resolved value is already `{ list, total }`. Changed to `contactsResp.list` / `contactsResp.total` across `index.vue`, `[id].vue`, `companies.vue`, `pipelines.vue`, `deals.vue`, `tasks.vue`, `leads.vue`. Also fixed `stages` responses (array returned directly): `resp.data || []` → `resp || []` in `pipelines.vue` (3 places) and `deals.vue` (1 place).
2. **Translations**: Added `crmContacts`, `crmContact`, `crmCompanies`, `crmPipelines`, `crmDeals`, `crmTasks`, `crmLeads` + CRM UI strings to `mail-vue/src/i18n/en.js` and `zh.js`.
3. **Brace bug**: Fixed missing closing `}` for `if (selectedPipeline.value)` blocks in `pipelines.vue` `saveStage` and `deleteStage` that broke the build.

### What was verified
- All 8 CRM APIs return 200 via curl: Contacts, Companies, Pipelines, Stages, Deals, Tasks, Leads, Activities
- Login returns JWT; unauthenticated/invalid-token → 401
- Mail counts still work under same session
- Frontend build succeeds (all CRM chunks present)

### Files changed
- `mail-vue/src/views/crm/index.vue` — `.data.list` → `.list`, `.data.total` → `.total`
- `mail-vue/src/views/crm/[id].vue` — `.data.list` → `.list`
- `mail-vue/src/views/crm/companies.vue` — `.data.list` → `.list`, `.data.total` → `.total`
- `mail-vue/src/views/crm/pipelines.vue` — `.data.list` → `.list`, `resp.data || []` → `resp || []` (3 places), brace fix
- `mail-vue/src/views/crm/deals.vue` — `.data.list` → `.list`, `resp.data || []` → `resp || []`
- `mail-vue/src/views/crm/tasks.vue` — `.data.list` → `.list`
- `mail-vue/src/views/crm/leads.vue` — `.data.list` → `.list`, `.data.total` → `.total`
- `mail-vue/src/i18n/en.js` — CRM translation keys added
- `mail-vue/src/i18n/zh.js` — CRM translation keys added
- `mail-worker/src/api/leads-api.js` — NEW: leads CRUD
- `mail-worker/src/api/activities-api.js` — NEW: activities CRUD
- `mail-worker/src/security/security.js` — leads/activities perm paths added
- `mail-worker/src/hono/webs.js` — leads/activities API imports registered
- `mail-worker/src/init/init.js` — v3_10DB: crm_leads, crm_activities, assigned_to columns, perm seeds
- `mail-vue/src/request/leads.js` — NEW
- `mail-vue/src/request/activities.js` — NEW
- `mail-vue/src/views/crm/leads.vue` — NEW
- `mail-vue/src/router/index.js` — crm-leads route added
- `mail-vue/src/perm/perm.js` — leads:query router entry added
- `mail-vue/src/modules/registry.js` — crm-leads added to routeNames

---

## Gate 1 — NEXT: Reliable Data Model

**Acceptance criteria:**
- Additive migration for `crm_organizations` (organizations table with parent/subsidiary, type, commercial terms)
- `crm_contact_organizations` association table (person ↔ org, role, is_primary)
- `crm_opportunities` (renamed from deals conceptually — extend crm_deals with deal_type, probability, next_step, loss_reason, win_reason)
- `crm_events` (external-event reference, not XPass ticketing)
- All tables: `user_id`, `created_by`, `updated_by`, `version`, `is_del`, timestamps
- API routes for each with user_id tenancy
- Perm keys: `organizations:*`, `opportunities:*`, `events:*`
- Backend authorization tested (401 without token, 403 without perm)
- Frontend build succeeds
- Mail untouched

**Suggested files:**
- `mail-worker/src/init/init.js` — `v3_11DB` migration
- `mail-worker/src/api/organizations-api.js` — NEW
- `mail-worker/src/api/contact-organizations-api.js` — NEW
- `mail-worker/src/api/events-api.js` — NEW
- `mail-vue/src/request/organizations.js` — NEW
- `mail-vue/src/views/crm/organizations.vue` — NEW

**Do not:** Reset local D1, connect production, copy AGPL code, create second app.

**Start from:** Current working tree state (all changes uncommitted, on branch `xpass/hq-development`).

**RAM note:** Avoid full `pnpm build` unless needed — use targeted curl API tests instead.

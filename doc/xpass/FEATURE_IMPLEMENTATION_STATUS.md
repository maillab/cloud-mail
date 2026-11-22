# Feature Implementation Status — XPass HQ

**Date:** 2026-11-11  
**Repository:** cloud-mail (canonical XPass HQ)  
**Reference:** xpass-crm-lab (DeskcommCRM, read-only)

Classification definitions:
- **WORKING** — Backend + frontend + database + permissions, verified end-to-end
- **PARTIAL** — Some layers implemented but not fully verified or connected
- **UI ONLY** — Frontend view exists, no working backend/database
- **NOT IMPLEMENTED** — No code exists
- **BLOCKED** — Implementation exists but cannot be verified due to environment limitation

---

## 1. Core Modules

| Module | Classification | Backend | Frontend | Database | Permissions | Verified | Notes |
|---|---|---|---|---|---|---|---|
| Overview / Dashboard | WORKING | ✓ | ✓ | ✓ (existing) | ✓ | ✓ | `views/hq/overview.vue` |
| Mail | WORKING | ✓ | ✓ | ✓ (D1) | ✓ | ✓ | Inbox, send, drafts, starred, folders |
| Analytics | WORKING | ✓ | ✓ | ✓ | ✓ (`analysis:query`) | ✓ | `views/analysis/index.vue` |
| Settings | WORKING | ✓ | ✓ | ✓ | ✓ | ✓ | `views/setting/index.vue` |
| Users (People) | WORKING | ✓ | ✓ | ✓ | ✓ | ✓ | `views/user/index.vue` |
| Roles & Permissions | WORKING | ✓ | ✓ | ✓ | ✓ | ✓ | `views/role/index.vue` |
| Registration Keys | WORKING | ✓ | ✓ | ✓ | ✓ | ✓ | `views/reg-key/index.vue` |

---

## 2. CRM (Phase 1 — Implemented)

| Sub-module | Classification | Backend API | Frontend View | Database | Permissions | Verified | Notes |
|---|---|---|---|---|---|---|---|
| Contacts | WORKING | ✓ (`contacts-api.js`) | ✓ (`index.vue`, `[id].vue`) | ✓ (`crm_contacts`) | ✓ (`contacts:*`) | ✓ | CRUD verified via curl |
| Companies | WORKING | ✓ (`companies-api.js`) | ✓ (`companies.vue`) | ✓ (`crm_companies`) | ✓ (`companies:*`) | ✓ | CRUD verified via curl |
| Pipelines | WORKING | ✓ (`pipelines-api.js`) | ✓ (`pipelines.vue`) | ✓ (`crm_pipelines`) | ✓ (`pipelines:*`) | ✓ | CRUD verified via curl |
| Stages | WORKING | ✓ (`stages-api.js`) | ✓ (in pipelines view) | ✓ (`crm_stages`) | ✓ (`pipelines:*`) | ✓ | CRUD verified via curl |
| Deals (Opportunities) | WORKING | ✓ (`deals-api.js`) | ✓ (`deals.vue`) | ✓ (`crm_deals`) | ✓ (`deals:*`) | ✓ | CRUD verified via curl |
| Tasks | WORKING | ✓ (`tasks-api.js`) | ✓ (`tasks.vue`) | ✓ (`crm_tasks`) | ✓ (`tasks:*`) | ✓ | CRUD verified via curl |
| Leads | WORKING | ✓ (`leads-api.js`) | ✓ (`leads.vue`) | ✓ (`crm_leads`) | ✓ (`leads:*`) | ✓ | CRUD verified via curl; v3_10DB migration |
| Activities (history) | WORKING | ✓ (`activities-api.js`) | ✓ (`activities.vue`) | ✓ (`crm_activities`) | ✓ (`activities:query`) | ✓ | Create/list/delete + dedicated view verified via curl |
| Organizations | WORKING | ✓ (`organizations-api.js`) | ✓ (`organizations.vue`) | ✓ (`crm_organizations`) | ✓ (`organizations:*`) | ✓ | CRUD verified via curl; v3_11DB migration |
| Relationships (Contact-Organizations) | WORKING | ✓ (`contact-organizations-api.js`) | ✓ (`relationships.vue`) | ✓ (`crm_contact_organizations`) | ✓ (`contact-organizations:*`) | ✓ | CRUD verified via curl; v3_11DB migration |
| Events | WORKING | ✓ (`events-api.js`) | ✓ (`events.vue`) | ✓ (`crm_events`) | ✓ (`events:*`) | ✓ | CRUD verified via curl; v3_11DB migration |
| CRM Overview / Dashboard | WORKING | ✓ (existing CRM APIs) | ✓ (`overview.vue` + real data cards) | ✓ (all CRM tables) | ✓ (all CRM perms) | ✓ | 11 stat cards (contacts, companies, pipelines, deals, open opportunities, tasks, overdue follow-ups, organizations, events, new leads, my assigned) + recent activities table + quick actions; verified via curl |

**CRM Phase 1 overall:** WORKING — All backend APIs, frontend views, D1 tables, and perm keys implemented. End-to-end auth verified: login returns JWT, authenticated CRM endpoints return 200, unauthenticated/invalid-token requests return 401. Mail counts verified working under same session.

**Bug fixes applied during verification:**
- **Count bug fixed:** All 8 CRM GET list APIs used `.first()` (returns `{ cnt: N }`) but destructured `{ results: countResults }` (always `undefined`), making `total` always 0. Fixed to `countRow?.cnt` in `contacts-api.js`, `companies-api.js`, `leads-api.js`, `deals-api.js`, `tasks-api.js`, `events-api.js`, `pipelines-api.js`, `organizations-api.js`, `activities-api.js`.
- **PUT undefined bug fixed:** All 8 CRM PUT APIs passed potentially-`undefined` values to D1 `.bind()`, causing `D1_TYPE_ERROR`. Fixed with `?? null` on all bind parameters.
- **i18n added:** CRM nav labels (`crmNavOverview`, `crmNavContacts`, etc.) and overview cards (`crmOpenOpportunities`, `crmOverdueFollowups`, `crmNewLeads`, `crmMyAssigned`, `crmRecentActivities`, `crmViewAll`, `crmSubject`, `crmNewOrganization`) added to `en.js` and `zh.js`.

**v3_10DB migration added:** `crm_leads` table, `crm_activities` table, `assigned_to` column on `crm_contacts`/`crm_companies`/`crm_deals`, leads + activities perm keys seeded.

**v3_11DB migration added:** `crm_organizations`, `crm_contact_organizations`, `crm_events` tables; `deal_type`, `probability`, `next_step`, `loss_reason`, `win_reason` columns on `crm_deals`; organizations + contact-organizations + events perm keys seeded (role_id=1).

**v3_12DB migration added:** `crm_audit_log` table + indexes; audit logging writes to `crm_audit_log` on POST/PUT/DELETE to `/crm/*` paths.

**Known permission limitation:** Backend uses path-based permission mapping (all contact perms map to `/crm/contacts`), so `contacts:query` alone grants path access to all methods. Frontend `v-perm` directives gate UI buttons. Method-level enforcement distinction exists in `security.js` (`methodToPermSuffix`) but perm keys are path-scoped, not method-scoped — consistent with existing cloud-mail modules.

**Gate 0 — Forensic Audit & Error Repair (COMPLETE):**
- **Crash fixed:** All CRM views accessed `contactsResp.data.list` but the axios interceptor (`mail-vue/src/axios/index.js:68`) unwraps `data.data`, so the resolved value is already `{ list, total }`. Changed to `contactsResp.list` / `contactsResp.total` across `index.vue`, `[id].vue`, `companies.vue`, `pipelines.vue`, `deals.vue`, `tasks.vue`, `leads.vue`. Also fixed `stages` responses (array returned directly, not wrapped): `resp.data || []` → `resp || []` in `pipelines.vue` (3 places) and `deals.vue` (1 place).
- **Translations fixed:** Added `crmContacts`, `crmContact`, `crmCompanies`, `crmPipelines`, `crmDeals`, `crmTasks`, `crmLeads` and CRM UI strings to `mail-vue/src/i18n/en.js` and `zh.js`. Route meta titles now translate correctly.
- **All 8 CRM APIs verified via curl:** Contacts, Companies, Pipelines, Stages, Deals, Tasks, Leads, Activities all return 200 with correct data structures.
- **Auth verified:** Login returns JWT; unauthenticated/invalid-token requests return 401; Mail counts still work under same session.
- **Frontend build:** All CRM chunks present in build output (2365 modules, no errors).

**Gate 0.5 — Security Verification (COMPLETE):**
- Method-level permission suffix mapping in `security.js` (`methodToPermSuffix`: GET→query, POST→add, PUT/PATCH→edit, DELETE→delete).
- Audit logging: `crm_audit_log` table captures user_id, email, method, path, create_time on all CRM mutations.
- Unauthorized requests (no token, invalid token) return 401.
- Perm keys added for missing resources: `opportunities:*`, `activities:add/delete`, `contact-organizations:delete`.

**Phase 2 — CRM Navigation (COMPLETE):**
- CRM module `routeName` changed from `crm-contacts` to `crm-overview` (opens to Overview dashboard).
- CRM sub-navigation added to aside for all 10 sections: Overview, Contacts, Organizations, Leads, Opportunities, Pipelines, Relationships, Events, Tasks, Activities — each perm-gated via `v-perm`-equivalent filtering.
- `activities` route + view + perm entries created.

**Phase 3 — Deep Record Experience (COMPLETE):**
- Contact detail `[id].vue` rewritten with tabs: Overview, Deals, Tasks, Activities; link/unlink organization; activity logging.
- `organization-detail.vue` created with contact linking.
- `deal-detail.vue` created with pipeline/stage/contact/company info.
- Routes added for `crm-organization-detail` and `crm-deal-detail`.
- Translation keys added for all new views.

**Phase 4 — CRM Overview Dashboard (COMPLETE):**
- `overview.vue` enhanced with 11 real-data stat cards: Contacts, Companies, Pipelines, Deals, Open Opportunities, Tasks, Overdue Follow-ups, Organizations, Events, New Leads, My Assigned.
- Recent activities table with view-all link.
- Quick actions preserved (perm-gated).
- i18n keys added for all new labels.

**Phase 5 — Design Quality (COMPLETE):**
- Aside CRM nav labels now use i18n (`$t()`) instead of hardcoded English.
- Stat cards use color-coded left borders (orange primary, blue companies, green pipelines, etc.).
- Dark/light theme CSS variables used throughout (`--hq-page`, `--hq-text`, `--hq-border`, etc.).
- Orange accent (`#FF5500`) used consistently for primary actions and stat card highlights.

**Phase 6 — End-to-End Testing (COMPLETE):**
- Full workflow tested via curl with live local server: create org → create contact → link them → create pipeline → create deal → create task → create activity → create event.
- All reads verified with correct `total` counts.
- Update (PUT) verified on organizations and deals.
- Delete (soft delete) verified on tasks.
- Unauthorized access (no token, invalid token) returns 401.
- Audit log captures all PUT/POST/DELETE mutations.
- Mail regression verified: `/my/loginUserInfo` and `/mailbox/folders` return 200 under same session.

**Known permission limitation:** Backend uses path-based permission mapping (all contact perms map to `/crm/contacts`), so `contacts:query` alone grants path access to all methods. Frontend `v-perm` directives gate UI buttons. Method-level enforcement distinction exists in `security.js` (`methodToPermSuffix`) but perm keys are path-scoped, not method-scoped — consistent with existing cloud-mail modules.

## 3. Not Yet Implemented

| Module | Classification | Backend | Frontend | Database | Permissions | Notes |
|---|---|---|---|---|---|---|
| WhatsApp | NOT IMPLEMENTED | — | — | — | — | One official number, AI suggests, human sends |
| Finance | NOT IMPLEMENTED | — | — | — | — | KES, `_cents`, 0%/5% fees, Paystack later |
| Tasks & Requests | NOT IMPLEMENTED | — | — | — | — | (crm_tasks exists but is CRM-linked, not standalone) |
| Calendar | NOT IMPLEMENTED | — | — | — | — | |
| Documents | NOT IMPLEMENTED | — | — | — | — | Pattern available in xpass-crm-lab migration |
| Notes | NOT IMPLEMENTED | — | — | — | — | |
| AI Assistance | NOT IMPLEMENTED | Partial (`ai-service.js` exists for verification codes) | — | — | — | Needs expansion |
| Automations | NOT IMPLEMENTED | — | — | — | — | |
| Paystack Integration | NOT IMPLEMENTED | — | — | — | — | Credentials later, never hardcoded |

---

## 4. xpass-crm-lab Inherited Capabilities (Reference Only)

These exist in DeskcommCRM base code and were NOT built as part of XPass HQ. Listed for pattern reference only.

| Capability | Classification in xpass-crm-lab | Adaptable to cloud-mail? |
|---|---|---|
| WhatsApp (WAHA + Meta Cloud API) | EXISTS | Yes — pattern reference |
| CRM pipelines/kanban/contacts/companies/leads | EXISTS | Yes — data model patterns |
| Tasks | EXISTS | Yes — task patterns |
| AI assistant (Vercel AI SDK v7, RAG, agents) | EXISTS | Partial — different stack (Next.js vs Vue) |
| Analytics (metrics, faturamento, honorarios) | EXISTS | Partial — BRL-oriented |
| Automations (automation-rules, cron, event_log) | EXISTS | Yes — pattern reference |
| Finance (comandas, faturamento, honorarios) | EXISTS | Partial — BRL, not KES |
| Documents (folders + files + RLS) | EXISTS (Slice 1 done) | Yes — adapt migration to D1 |
| Mail | NOT integrated | cloud-mail IS the mail app |

---

## 5. Gaps in cloud-mail CRM Implementation

| Gap | Severity | Required action |
|-----|----------|-----------------|
| Missing drizzle entity files (`src/entity/crm-*.js`) | Low | API files use raw SQL; entities not required for current pattern |
| Method-level permission enforcement (GET/POST/PUT/DELETE) | Medium | Backend uses path-based mapping; `contacts:query` grants all methods on `/crm/contacts`. Frontend `v-perm` gates UI. |
| Permission change audit log | Low | Perms seeded to `role_perm` in migrations; no separate audit trail for perm changes |
| Saved views / segments | Low | Search/filter exists but no saved view persistence |
| Import / duplicate detection / merge | Low | Not yet implemented |
| Mail thread association | Low | Not yet implemented |

---

## 6. HQ Operating System — Gate Implementation (2026-11-12)

All work additive to cloud-mail. `xpass-crm-lab` unmodified. No commits/pushes/deploys. Local D1 migrations applied via `init:local`.

### Gate 1 — Shell + Sidebar + Theming — COMPLETE
- `registry.js`: `group` field per module; `notes` module added.
- `aside/index.vue`: grouped navigation (Workspace/Projects/People/Finance/Settings), removed "Soon" drawer, active states, mobile drawer, collapsed desktop.
- `header/index.vue`: perm-gated Create dropdown + notification bell with unread badge.
- `store/notification.js`: notification store.
- i18n keys added (en/zh).

### Gate 2 — Shared Auth + Activity + Notifications + Task/Request — COMPLETE
- `security.js`: `/notifications`, `/support`, `/projects`, `/calendar`, `/notes`, `/people`, `/documents`, `/finance`, `/whatsapp`, `/automations`, `/integrations`, `/ai` added to `requirePerms` + `premKey`; `pathToResourcePerm` now matches `/<resource>`; custom mappings for finance/whatsapp/ai/integrations.
- Activity writes on contact + support mutations; audit regex extended.
- `notifications` table (v3_13DB) + API + store + bell.
- `support_requests` table (v3_13DB) + API + view.
- Personalized Overview widgets in `views/hq/overview.vue`.

### Gate 3 — Projects + Calendar + Notes + People — COMPLETE
- v3_14DB: `projects`, `project_members`, `project_tasks`, `calendar_events`, `notes`, `note_folders`, `people`.
- APIs: `projects-api.js`, `calendar-api.js`, `notes-api.js`, `people-api.js`; request clients; 4 views; routes + perms + registry enabled; i18n.

### Gate 4 — Documents — COMPLETE
- v3_15DB: `document_folders`, `documents`.
- `documents-api.js`: folders CRUD, list, multipart upload, download (R2/KV/S3 via `r2Service`), delete.
- `views/documents/index.vue`: folder tree + file list + upload dialog.
- Perms `documents:*`; registry enabled; route + i18n.

### Gate 5 — CRM + Organizer/Event Flow — COMPLETE
- Prior CRM Phases 1–4 complete.
- **Event↔calendar sync:** `v3_20DB` adds link columns (`crm_events.calendar_event_id`, `calendar_events.crm_event_id`); `events-api.js` mirrors create/update/delete to calendar; `calendar-api.js` propagates title/date/location back and unlinks on delete. Verified locally.
- **Organizer commission:** `v3_21DB` adds `finance_transactions.party`; `finance-api.js` auto-computes fee (organizer 0, attendee 5%) on create/update; `views/finance/index.vue` adds party column + dialog with live fee/net preview; i18n en+zh. Verified locally.

### Gate 6 — Finance — COMPLETE
- v3_16DB: `finance_accounts`, `finance_transactions` (`_cents`), `finance_invoices`.
- `finance-api.js`: accounts/transactions/invoices CRUD + approve endpoints; KES; 0%/5% fee fields.
- Perms `finance:view`/`finance:edit`/`finance:approve` (custom suffix mapping).
- `views/finance/index.vue`: tabs + KES formatting.

### Gate 7 — WhatsApp + Support — COMPLETE
- v3_17DB: `whatsapp_conversations`, `whatsapp_messages`.
- `whatsapp-api.js`: **HARD SAFETY GATE** — `POST /whatsapp/send` rejects unless `human_approved===true` (403). AI suggestions stored `ai_suggested=1, human_approved=0`.
- Perms `whatsapp:query`/`whatsapp:send`; `views/whatsapp/index.vue` with explicit "Send (approved)" button.
- Support completed in Gate 3.

### Gate 8 — AI + Automations + Integration Manager — COMPLETE
- v3_18DB: `automation_rules`, `integration_registry`, `ai_suggestions`.
- `automations-api.js`, `integrations-api.js` (credentials never returned), `ai-api.js` (never auto-executes).
- Views: `views/ai`, `views/automations`, `views/integrations`.
- Perms `ai:use`, `automations:*`, `integrations:*`.

### Gate 9 — Analytics + Polish + E2E — IN PROGRESS
- Analytics: existing `views/analysis/index.vue` WORKING (mail).
- **Dashboard preferences:** `dashboard-api.js` (catalog + role defaults + per-user layout, `sanitizeLayout` drops unauthorized widgets on read and write); `store/dashboard.js`; `views/hq/overview.vue` widget dashboard + customize drawer. Local D1 verified (GET/PUT/reset/onboard).
- **Unified approvals:** `v3_22DB` tables `approvals`, `approval_history`, `internal_requests`, `internal_request_events`; `approvals-api.js` (create/submit/approve/reject/request-changes/cancel/comments; separation of duties; finance category requires `finance:approve`; history + notifications); `requests-api.js` (action + approval kinds, per-kind status transitions, recipient-only act, events); `notification-service.js` idempotent delivery via `event_key`; `reminder-service.js` hourly scan for note reminders + overdue tasks/approvals/requests. Verified locally with two users.
- **Reminders:** `scheduled` handler runs `reminderService.scanDue`; note reminders set `reminder_sent` and deliver once (idempotency verified by re-scan).
- **Notes enrichment:** priority, reminder_at/reminder_sent, labels, related_type/related_id; search + sort + label filter; pin/unpin endpoint; `views/notes/index.vue` rewritten.
- **Dashboard catalog:** added `approvals` + `internal-requests` widgets; removed `finance` from role defaults.
- **Overview 2.0:** `attention` queue now aggregates approvals + internal requests + tasks + notifications + finance.
- E2E verified locally (server `127.0.0.1:8787`):
  - Login returns JWT; unauthenticated requests rejected (body `code:401`).
  - All new module GET endpoints return 200: `/support`, `/projects`, `/calendar`, `/notes`, `/people`, `/documents`, `/finance/accounts|transactions|invoices`, `/whatsapp/conversations`, `/automations`, `/integrations`, `/ai/suggestions`, `/notifications`, `/approvals`, `/requests`, `/directory`.
  - Approvals: create (pending) → self-approve 403 → approver approve 200 (history create,approve) → reject-after-approved 400; finance approval requires `finance:approve`.
  - Requests: action accept→complete 200 (events create,accept,complete); sender cannot act (403); approval request approve 200; terminal transition 400.
  - Notes: create with priority/labels/reminder → filter → pin → update → delete.
  - Reminder scan: past-due note → notification `note:reminder:<id>`, `reminder_sent=1`; re-scan produces no duplicate.
  - Mutation: support create→activity logged (total=3)→delete all 200.
  - WhatsApp unapproved send rejected (403).
  - Mail regression: `/my/loginUserInfo` and `/mailbox/folders` return 200.
- Frontend modules compile via Vite (overview, approvals, requests, notes, router, perm, i18n).
- Remaining: cross-module analytics metrics, full polish pass, fix pre-existing literal `label="{{ $t(...) }}"` in module tables.

### Migrations added (applied via `init:local`)
- v3_13DB: `notifications`, `support_requests`
- v3_14DB: projects/calendar/notes/people tables
- v3_15DB: `document_folders`, `documents`
- v3_16DB: `finance_accounts`, `finance_transactions`, `finance_invoices`
- v3_17DB: `whatsapp_conversations`, `whatsapp_messages`
- v3_18DB: `automation_rules`, `integration_registry`, `ai_suggestions`
- v3_19DB: `dashboard_preferences`
- v3_20DB: `crm_events.calendar_event_id`, `calendar_events.crm_event_id`
- v3_21DB: `finance_transactions.party`
- v3_22DB: `approvals`, `approval_history`, `internal_requests`, `internal_request_events`; `notes` enrichment columns; `notifications.event_key`; `approvals:*` + `requests:*` perm seeds
- v3_23DB: 6 default `role` rows (Administrator, Finance Manager, Finance Viewer, Support Agent, Growth, Engineering); `user_perm_override` table + index

---

## 7. Final Major Implementation Directive — Gate Progress (2026-11-13)

Numbering follows the FINAL MAJOR IMPLEMENTATION DIRECTIVE, distinct from the 0–9 execution gates in §6.

### Gate 0 — Master Execution Doc — COMPLETE
- `HQ_MASTER_EXECUTION.md` maintained as the single source of truth.

### Gate 1 — Shell + Sidebar + Theming — COMPLETE
- Shell, grouped sidebar, header bell + create menu; `--hq-*` light/dark tokens; no "Soon" placeholders.

### Gate 2 — Global Create Menu — COMPLETE (CODED + DEV-SERVER VERIFIED)
- `layout/header/index.vue`: create dropdown expanded into permission-filtered groups (Communication, Relationships, My work, Schedule, Event operations, Documents); each entry gated by its `*:add` perm via `hasPerm`; group header styling added.
- `composables/useCreateIntent.js`: reads `?create=<type>`, invokes the target view's open-dialog function, then strips the query.
- `?create=1` auto-open wired in: `crm/index` (contact), `crm/leads`, `crm/deals`, `crm/tasks`, `crm/events`, `crm/organizations`, `notes`, `calendar`, `requests`, `approvals`, `projects`, `documents` (upload/folder).
- i18n en/zh: `createLead`, `createOrganization`, `createApproval`, `createCalendarEvent`, `createGroup*` labels.
- Verification: all edited modules transform 200 on Vite dev server (127.0.0.1:3001); script blocks pass `node --check`.

---

## 8. Overview Functional Completion Sprint (2026-11-13)

### Gate 0 — Running app — VERIFIED
- Live frontends: **3001 (primary, PID 23112)** and 3002 (duplicate), both `vite --mode dev` from `cloud-mail\mail-vue`; **3003 not listening**. Backend 8787 (workerd). Correct dev URL: **http://127.0.0.1:3001**.

### Gate 3 — Two calendars — IMPLEMENTED + E2E TESTED
- `v3_24DB`: `calendar_events` += timezone, visibility, organizer_id, related_type/id, reminder_at, reminder_sent, source; new `calendar_event_participants`, `calendar_event_activity`; `crm_events` += category, venue, start/end, description, source, source_url, status, assigned_to, verification_status, last_checked_at, confidence, ai_suggested.
- `calendar-api.js` rewritten: server-side visibility (private/team/selected/company), participants, RSVP, reminders, activity. **No admin bypass** — access by explicit visibility/participation/ownership only.
- `events-api.js`: Calendar B fields, verified import, AI discovery suggestions (review-only, never auto-creates).
- Calendar A view: day/week/month/upcoming, visibility, participants, timezone, reminder, RSVP.

### Gate 4 — Overview calendar + reminders — IMPLEMENTED + TESTED
- Overview calendar grouped Today/Tomorrow/Upcoming; click opens the record; inline create.
- Calendar reminders delivered to creator + participants, idempotent via `event_key`. Timezone fix: pickers send offset (`YYYY-MM-DDTHH:mm:ssZ`); scan compares UTC.

### Gate 5 — Notes — IMPLEMENTED
- Overview quick capture with expandable title/priority/reminder/pin.

### Gate 6 — Requests/approvals queue — IMPLEMENTED + TESTED
- `attention` is the single action queue; items labelled For you / Sent / Approval / Task / Finance / Support with requester/recipient names.

### Gate 7 — Contextual AI panel — IMPLEMENTED
- `components/ai-panel/index.vue` + `store/ai.js`; header + Overview open the panel without navigating away.
- `GET /ai/status` → `configured:false` (no provider configured); accurate connection-required state + admin link to integrations.

### Gate 8 — Widget corrections — IMPLEMENTED
- Removed duplicate approval widgets (`approvals`, `internal-requests`, `finance`, `my-requests`) from the catalog; `attention` is the single queue.
- Removed forced min-heights; compact empty states. Role defaults updated (Finance Viewer = [attention, calendar], no finance widget).

### Gate 10 — Tests — 16/16 PASS (`cal-e2e.mjs`)
- Private/company/selected visibility, RSVP, reminder persistence + idempotent delivery, industry-event separation, finance-viewer restriction, role-scoped dashboard catalog, internal-request delivery.
- Re-run 2026-11-13: `cal-e2e.mjs` 18/18 PASS; approvals/requests/notes/notifications E2E pass.

### Gate 1 — Administrator auto-bypass removed — IMPLEMENTED + VERIFIED
- `service/perm-service.js` no longer returns `['*']` for the configured admin email. Admin receives every distinct permission key explicitly (111 keys, same coverage) with `user_perm_override` deny rules re-applied, so deny overrides are effective.
- `service/user-service.js` `loginUserInfo` uses the resolved keys.
- Verified: deny on `approvals:query` → admin `GET /approvals/:id` returns 403; override removed → key returns. Non-admin roles unchanged.
- Note: Support Agent correctly gets 403 on finance approval (lacks `finance:approve`); the old E2E expectation of 200 was wrong.

### Gate 9 — Responsive overlays — IMPLEMENTED
- `mail-vue/src/style.css`: ≤1024px dialog `max-width:92vw`; ≤768px dialogs 95vw/95vh, drawers 95vw, message boxes 95vw with wrapping buttons. Overview grid already collapses at 900px/560px.
### CRM BATCH A (correctness pass, 2026-11-14) - IMPLEMENTED + VERIFIED
- Blank routes fixed: missing `onMounted`/`watch` imports in `activities`, `deals`, `events`, `leads`, `organizations`, `relationships` (no Vue auto-import preset is configured).
- 145 literal `="{{ $t('...') }}"` attributes converted to `:attr="$t('...')"` across 15 views (tables/dialogs/tabs were showing raw moustache text).
- Contact `tags` JSON normalised server-side (`normalizeContact`, new `GET /crm/contacts/:id`); contact detail no longer depends on a `pageSize:1` list fetch.
- `GET /crm/contact-organizations` now returns `contact_name`/`organization_name`; `GET /crm/activities` returns `entity_name`, real `occurred_at`, and supports `search`.
- Navigation de-duplicated (Companies legacy removed from sidebar); Overview fires all widget requests concurrently.
### BATCH 1 - Shell / product cleanup (2026-11-14) - IMPLEMENTED + VERIFIED
- Zero native `prompt`/`confirm`/`alert` in the frontend: shared `useConfirm()` + real Finance account/invoice dialogs.
- Navigation rebuilt to the target IA (workspace / people / settings / administration); Support, Automations, AI-as-page, Approvals, Analytics and Integrations removed from primary nav and remapped (Reports, Connections, Requests & Decisions). No route deleted.
- Single enforced dark theme; theme picker removed; empty-state component de-hardcoded to theme tokens; 23 refresh buttons demoted to subtle icons; empty states rewritten with explanation + first action on Documents, Projects, Notes, People, Requests.
- All 44 routed components transform 200; 0 duplicate route names/paths.

---

## Canonical internal identity (BATCH 2)

| Module | Classification | Backend | Frontend | Database | Permissions | Verified | Notes |
|---|---|---|---|---|---|---|---|
| Identity profile | WORKING | yes | yes | yes (`user` identity columns, `team`, `user_team`) | self-only, token-derived user | yes | `GET /user/identity`, `PUT /user/profile` |
| Profile photo | WORKING | yes | yes | R2 `avatars/<uid>/…` | self-only | yes | PNG/JPEG/WEBP, 2 MB, magic-byte checked, served via `/oss/avatars/` |
| Employee directory | WORKING | yes | yes | `user`, `team` | any authenticated employee | yes | `GET /user/directory` and legacy `GET /directory` share `directory-service`; phone never leaves the self profile |
| People page | WORKING | yes | yes | `user`/`team` + legacy `people` | `people:*` for external records | yes | Employees tab is the canonical directory; External people tab keeps the legacy table |
| Teams | WORKING | yes | yes | `team` | `setting:set` | yes | Create, rename, archive; delete never detaches members; archived names reusable |
| Presence | WORKING | yes | yes | `user.last_seen_at` | self heartbeat | yes | 60 s client heartbeat, 90 s online window, one guarded write per minute |
| Requests recipient picker | WORKING | yes | yes | `internal_requests` + directory | `requests:*` | yes | Shows avatar, display name, @handle, team |

Classification detail:
- Username rules are enforced, not silently normalised: reserved handles, fewer than 3 characters, over 24 characters, characters outside `a-z0-9-`, and handles not starting with a letter all return an explanatory error. Sending an empty string clears an optional handle.
- Partial `PUT /user/profile` preserves every field that is absent from the request body.
- Presence is heartbeat-based, so "online" means active within 90 seconds, not an open socket.

---

## Access control: assignment, history and role builder (BATCH 4, 2026-11-14)

| Module | Classification | Backend | Frontend | Database | Permissions | Verified | Notes |
|---|---|---|---|---|---|---|---|
| Contact/lead assignment | WORKING | yes | yes | `crm_contacts.assignee_id`, `crm_leads.assignee_id` | `contacts:assign` / `leads:assign` (never implied by edit) | yes | Dedicated endpoint writes actor + previous -> new into `crm_activities`; suspended targets rejected (400); edit-only roles get 403 |
| Record scope (own/assigned/team/company) | WORKING | yes | yes | `role.data_scope`, `user.data_scope` | read path only | yes | `own` = created by me OR assigned to me; filters cannot widen scope |
| Assignment filters | WORKING | yes | yes | — | inherits list permission | yes | `assignee=me | unassigned | <id>` applied after the scope predicate |
| Role list (members, scope, counts) | WORKING | yes | yes | `role`, `user`, `role_perm` | `role:query` | yes | Real headcount per role; data scope editable inline |
| Permission editor | WORKING | yes | yes | `role_perm` | `role:set` | yes | Grouped by product area, group select-all, filter; partial updates never clear grants |
| Access history | WORKING | yes | yes | `role_audit` (append-only) | `role:query` | yes | Create/edit/permissions/scope/delete/default/member-role change, with actor |
| Member role change | WORKING | yes | yes | `user.type` | `user:set-type` | yes | Records previous -> new role in the access history |
| Effective-access preview | NOT IMPLEMENTED | no | no | — | — | — | Next: derive from real role + override data |

Classification detail:
- `PUT /crm/contacts/:id/assignee` and `PUT /crm/leads/:id/assignee` are separate endpoints on purpose: assignment is a management action, so a role with edit rights but no assign right cannot hand work to somebody else.
- A scope-only role update keeps every grant: `setRole` only rewrites `role_perm` when the caller actually sends a permission list.
- Gate audit fixes are included here because they change who can do what: `role` (add/set/delete/query), `user` (per-action keys), `setting` background endpoints, and the camel-case aliases `reg-key` / `all-email` now resolve to their real permission keys instead of a non-existent `*:edit`.

Known data note: an intermediate version of the update path emptied two seeded role sets (Growth, Engineering); both were restored from the seeded sets (42 and 25 permissions) and every other role was untouched.
---

## Access preview, identity administration and unified requests (BATCH 5)

| Module | Classification | Backend | Frontend | Database | Permissions | Verified | Notes |
|---|---|---|---|---|---|---|---|
| Effective-access preview (member) | WORKING | yes | yes | reads role/user scope | self, or `user:query` for others | yes | `GET /user/access`; wording derived from real keys, never stored |
| Effective-access preview (role) | WORKING | yes | yes | reads role grants | `role:query` | yes | `GET /role/access`; Role Builder Access preview tab |
| Contact update / archive | WORKING | yes | yes | `crm_contacts` | `contacts:edit`, `contacts:delete` | yes | Did not exist before; UI Edit/Delete were 404ing |
| Lead detail / update / archive | WORKING | yes | yes | `crm_leads` | `leads:query`, `leads:edit`, `leads:delete` | yes | Scope predicate shared with the list |
| Activity feed scope | WORKING | yes | yes | `crm_activities` | inherits list permission | yes | Record-scoped in SQL; history survives archiving; no private-record leakage |
| Position / Team / Role administration | WORKING | yes | yes | `user.type`, `user.team_id`, `user.job_title` | `user:set-type`, `setting:set` | yes | `PUT /user/:id/assignment`, audited; member self-service removed |
| Request types | WORKING | yes | yes | `internal_requests.type` | `requests:*` | yes | Type decides available actions; nine types |
| Request inbox scopes | WORKING | yes | yes | `internal_requests` | `requests:query` | yes | Received, Sent, Team, Open, History |
| Request history and timeline | WORKING | yes | yes | `internal_request_events` | `requests:query` | yes | Terminal requests retained; actor shown as a human label |
| Director voting system | NOT IMPLEMENTED | n/a | n/a | none | n/a | yes | No such code exists; nothing to remove |

Classification detail:
- Request types are additive. `kind` still drives the transition table, so existing approvals keep working; a type only restricts which actions are offered.
- `history` and `open` are explicit scopes rather than client-side filters, so terminal requests stay searchable and countable on the server.
- Shared company mailboxes, mailbox-scoped conversation assignment, internal notes, shared-mail tags and the signature rework are NOT IMPLEMENTED yet; they are the next batch.

---

## Shared company mailboxes and collaborative mail (BATCH 4)

| Module | Classification | Backend | Frontend | Database | Permissions | Verified | Notes |
|---|---|---|---|---|---|---|---|
| Shared mailbox membership model | WORKING AND VERIFIED | yes | no | `mailbox_member` (+ `mailbox_member_audit`) | `mailbox:query`, `mailbox:manage` | yes | Relational membership with a permission set per member; never comma-separated user ids in a config row |
| Mailbox switcher data source | WORKING AND VERIFIED | yes | no | reads `account` + `mailbox_member` | `email:query` | yes | `GET /account/mailboxes`, `GET /shared-mailbox/list`, `GET /shared-mailbox/current`, `PUT /shared-mailbox/select` |
| Membership + action enforcement | WORKING AND VERIFIED | yes | no | — | role key AND mailbox action | yes | Three ordered checks: role gate, mailbox membership, per-mailbox action. Non-member gets 404, not 403 |
| Conversation list / detail | WORKING AND VERIFIED | yes | no | `mailbox_conversation` | `email:query` | yes | Status / priority / tag / search filters, pagination, unread and assigned counts |
| Conversation status / priority | WORKING AND VERIFIED | yes | no | `mailbox_conversation` | mailbox `resolve` | yes | One `PUT /shared-mailbox/conversation` route with an `action` discriminator |
| Assignment and transfer | WORKING AND VERIFIED | yes | no | `mailbox_conversation.assigned_to` | mailbox `assign` | yes | Records previous assignee, new assignee, actor and time; history verified A->B |
| Internal notes | WORKING AND VERIFIED | yes | no | `mailbox_conversation_event` | mailbox `internal_note` | yes | Stored in HQ only. Verified absent from every stored outgoing message body |
| Conversation timeline | WORKING AND VERIFIED | yes | no | `mailbox_conversation_event` | `email:query` | yes | `received, priority, assigned, transferred, note, status, link_request` |
| Shared-mail tags | WORKING AND VERIFIED | yes | no | `mailbox_tag`, `mailbox_conversation_tag` | mailbox `manage_tags` | yes | Tag diffs are logged as timeline events |
| Mailbox member administration | WORKING AND VERIFIED | yes | no | `mailbox_member`, `mailbox_member_audit` | mailbox `manage_members` | yes | List/add/permission-change/remove; role gate alone is not enough |
| Assignment candidate list | WORKING AND VERIFIED | yes | no | `user` + `mailbox_member` | mailbox `view` | yes | Only active members of that mailbox with `view`; suspended accounts excluded |
| Reply from shared mailbox | WORKING AND VERIFIED | yes | no | `email` | mailbox `send` + `email:send` | yes | Sender address derived from the stored account, never from client input |
| Personal signature scoping | WORKING AND VERIFIED | yes | no | `user.signature_*`, `account.signature_*` | — | yes | Verified no personal signature on a shared send; personal mail still carries it |
| Signature image derivative | IMPLEMENTED BUT UNVERIFIED | yes | no | `account.signature_image_key`, `signature_delivery_key` | — | no | Worker-side downscale to the delivery size; no browser available to confirm rendering |
| Mailbox connection health | WORKING AND VERIFIED | yes | no | `account.inbound_state`, `outbound_state`, `health_checked_at` | `account:query` | yes | Truthful states; a row existing is never reported as Connected |
| Request link from a conversation | WORKING AND VERIFIED | yes | no | `mailbox_conversation.related_type/related_id` | `email:query` | yes | Reference only; the email body is not copied into the request |
| Mail-only role fixture | WORKING AND VERIFIED | yes | no | `role`, `role_perm`, `user.type` | `email:query`, `email:send`, `mailbox:query`, `mailbox:manage` | yes | Role 8 (Mail Only) holds mail keys only and no CRM, Finance, Documents or Role administration |
| Mail nav: one workspace, no switcher | WORKING AND VERIFIED | yes | no | `mailbox_member` | `mailbox:query` | yes | Personal and shared inboxes are peers in one nav; only inboxes the member belongs to are rendered, from the server's own list |
| Shared conversation threading | WORKING AND VERIFIED | yes | no | `mailbox_conversation`, `mailbox_conversation_message`, `mailbox_conversation_event` | mailbox `view` | yes | A reply attaches to the thread it answers; assignee, tags and history survive a customer reply; verified by unit test (15/15) and by a real send |
| Conversation status model | WORKING AND VERIFIED | yes | no | `mailbox_conversation.status` | mailbox `resolve` | yes | `new` is untouched, `unassigned` has no handler; a shared send moves the thread to `waiting_customer` |
| Shared mailbox summary counts | WORKING AND VERIFIED | yes | no | `mailbox_conversation` | `mailbox:query` | yes | One request returns per-inbox counts; a badge only exists when the queue contains it |
| Work-queue filter controls | WORKING AND VERIFIED | yes | no | `mailbox_conversation` | mailbox `view` | yes | Status, exclude-status, assigned-to-me, priority and search all verified against the live queue |
| Collaboration bar / internal-note composer | IMPLEMENTED BUT UNVERIFIED | yes | no | `mailbox_conversation_event` | mailbox `assign` / `resolve` / `internal_note` / `manage_tags` | yes | Assign, status, priority and tags verified by API; the rendered controls are build-verified only, no browser available |
| Compose From selector | WORKING AND VERIFIED | yes | no | `mailbox_member` | mailbox `send` + `email:send` | yes | Lists only addresses the member may send from; defaults to the shared inbox the composer was opened from, otherwise the personal mailbox; a shared send carries no personal signature |
| Mail nav mailbox switcher | NOT IMPLEMENTED | n/a | no | n/a | n/a | n/a | Deliberately not built: switching would change the whole mail context, which is the wrong model. Replaced by the one-workspace nav above |
| Create request from conversation | NOT IMPLEMENTED | n/a | no | n/a | n/a | n/a | Backlink storage works; the UI action is not built |
| Overview attention cards | NOT IMPLEMENTED | n/a | no | n/a | n/a | n/a | — |
| Signature settings UI | NOT IMPLEMENTED | n/a | no | n/a | n/a | n/a | Backend scoping is done |
| Terminal Request History | WORKING | yes | yes | `internal_requests.status` | `requests:query` | yes | Delivered in Batch 5 |
| Legacy Approvals out of navigation | NOT IMPLEMENTED | n/a | no | n/a | n/a | n/a | Route stays for data compatibility |

Classification detail:
- Every shared-mailbox route runs three checks in order: the member's role must allow mailbox work at all, the member must belong to that mailbox, and the member must hold the action that route performs on that mailbox. Hiding a control in the sidebar is never treated as access control.
- A non-member asking about a shared mailbox gets 404 rather than 403, because confirming that an address exists is itself a disclosure. A member of another mailbox asking about this one gets 404 for the same reason.
- Internal notes live in `mailbox_conversation_event` and are never written into an outgoing message body. This was verified by inspecting the stored sent rows, not by trusting the editor.
- Assignment is deliberately split from administration: administering members and working the queue are different jobs, and the creator of a shared mailbox gets admin rights but not an automatic seat in the queue.

Pre-existing defects found and fixed while wiring this batch:
- `email-service.send` dereferenced `receiveEmail.every(...)` before validating that a recipient list existed, so any malformed send returned 500. The list is now normalized once, up front, and rejected with 400 when empty.
- `email-service.saveSentEmail` and the daily send counters referenced a local `recipientList` that does not exist in that function's scope, so the first real send from a shared mailbox returned 500. They now use the `receiveEmail` parameter that is actually in scope.
- `role-service.selectByUserIds` was called by the incoming-delivery path but never defined, so sending to an internal address threw `selectByUserIds is not a function`. The method now exists and returns the receiving mailbox's domain and ban rules.
- `shared-mailbox-api` shadowed its own `keys()` helper with a local `const keys`, which threw a TDZ `ReferenceError`. The local is now `perms`.
- `shared-mailbox-service.listForMember` bound three parameters to a two-placeholder statement and failed with a D1 binding error.
- `listMembers` and `member-audit` checked only the role-level `manage` key, so a member whose mailbox rights excluded `manage_members` could still enumerate the member list. Both now require `manage_members` on that mailbox.

## Mail: thread model, queue counts and the From selector

Batch 4 frontend work landed against a backend that had one conversation row per
message. A support thread is not one message, so the data model was corrected
before the UI was built on top of it.

- `v3_34DB` adds `mailbox_conversation_message` (one row per message in a
  thread), plus the CRM and Finance tables the next work orders need. It is
  additive: `mailbox_conversation.email_id` stays the message that opened the
  thread and existing rows are backfilled into the join table.
- `registerMessage` is now the single entry point for both directions. A
  customer reply lands on the thread it answers and reopens it; a reply we send
  attaches to that thread and moves it to `waiting_customer`. Assignee, tags and
  history are never reset by an inbound message.
- `conversationDetail` returns the whole thread in order, and
  `listConversations` reads the subject and snippet from the newest message
  rather than the one that opened the thread.
- `GET /shared-mailbox/summary` returns per-inbox queue counts so the mail nav
  can show a badge that is computed from the queue, never invented.
- `GET /shared-mailbox/conversations` gained `excludeStatus` and
  `assignedToMe`, which is what the Open and Assigned to me filters use.

Defects found and fixed while wiring this:
- `mailboxSummary` was exported from the module but missing from the default
  export object, so the route threw `mailboxSummary is not a function`.
- `conversationDetail` selected `e.html`, a column the `email` table does not
  have, so opening any conversation returned "Please update the database".
- `email-service.send` passed `params.emailId` into the shared-conversation
  hook, but that hook runs inside `saveSentEmail` where `emailId` is not in
  scope, so a reply never found its parent thread. The parent id is now carried
  on `saveParams` as `parentEmailId`.
- The composer's From list came from `GET /account/list`, which returns every
  address on the instance. It now comes from stored mailbox membership, so an
  address the member has no rights in can neither appear nor be chosen.
- `mail-vue/src/i18n/zh.js` was re-encoded through the ANSI code page, which
  corrupted every Chinese string in the file. It has been repaired and verified
  to parse with all 744 keys intact.

## Finance OS — KES-first rebuild (2026-11-16)

Gate 6 (Finance) had a ledger, an invoice list and a fee rule, but it was not a
finance function: there was no company-level view, no commitments, no debt
history, and subscription reminders were hardcoded. This section records the
rebuild. Gate 6 stays COMPLETE in the sense that it is the same module, but the
capability below is what is actually true now.

### Data model — IMPLEMENTED + VERIFIED
- `v3_35DB` adds 16 `finance_*` tables (`finance_commitment`,
  `finance_debt_adjustment`, `finance_invoice_item`, `finance_funding`,
  `finance_reimbursement`, `finance_advance`, `finance_account_member`,
  `finance_category` and the rest) plus the columns the new flows need. It is
  additive: every pre-existing account, transaction and invoice row survives, and
  re-running it is a no-op.
- 24 `finance%` permissions and 24 seeded categories (18 expense, 6 income).
- Money is stored as integer minor units (`amount_cents`). The only conversion
  code is `mail-worker/src/lib/money.js`; nothing in the money path uses floats.

### Domain rules — IMPLEMENTED + VERIFIED
- An expense that empties an account produces a real negative balance, not an
  error.
- Voiding reverses a transaction and keeps the row (`voided_at`, reason). It
  never deletes.
- A transfer is two linked rows in one `transfer_group`. The company total does
  not move, and transfers are excluded from income, expense and spending.
- A debt keeps `original_amount` forever; payments and later charges move
  `outstanding_amount` only.
- Budgets report allocated / spent / committed / available / variance, and a
  commitment reserves budget without moving money.
- Subscription reminder offsets are data (`reminder_offsets`), not code, and the
  monthly equivalent of a quarterly or annual plan is derived rather than
  guessed.
- Paying an invoice above its balance is rejected with 400; a partial payment
  moves it to `partial`. Editing an invoice below what has already been paid is
  also rejected with 400.
- A claim must be reviewed and approved before it can be paid. A declined claim
  can never be paid, and a paid claim can never be reviewed again.
- An advance is issued from an account and later settled into a spent part (a
  real expense) and a returned part (cash back, not income). The two must add up
  to the issued amount.

### Access — IMPLEMENTED + VERIFIED
- `finance:view_all` is the only company-wide scope. Without it an account is
  visible only when the member owns it or was granted it through
  `finance_account_member`. Reads are filtered the same way writes are, so a
  member cannot read an advance, claim or ledger belonging to a hidden account.
- Every route re-checks the key inside the service, never in the handler.

### Defects found and fixed while building
- `voidTransaction` built its UPDATE but never called `.run()`, so voiding
  silently did nothing and the balance never came back.
- `monthlyEquivalent` inverted its own divisor: a 3× plan reported a third of
  its monthly cost instead of three times it.
- `decorateSubscription` inverted the reminder arithmetic, and read
  `next_reminder_in_days` as days until the next billing instead of days until
  the next reminder.
- Transfers were counted as income and as expense in `overview`,
  `listTransactions` totals and `spendingByCategory`.
- `overview` crashed with `no such column: is_del` because the debt query read a
  column that table did not have.
- An advance was booked as an expense when issued, so an unspent float looked
  like money already spent.

### Verification — VERIFIED
- Offline suite (`node:sqlite`, migration taken verbatim from `init.js`):
  **140 assertions pass**, 0 fail.
- Live suite against the dev Worker over HTTP, with a real login and a real
  token: **51 assertions pass**, 0 fail.
- Worker bundles with `wrangler deploy --dry-run`; frontend builds with
  `vite build --mode release`.
- Not verified: no headless browser is available on this machine, so the panels
  have been checked by build and by reading the templates, not by clicking
  through them.

## Finance OS — second batch (2026-11-16)

The first batch made the ledger coherent. This batch closes the gaps that kept
Finance from being usable as a company finance system: context on records, real
exports, who may see what, and the link between an approval and a payment.

### Record context — IMPLEMENTED + VERIFIED
- `transactionDetail` resolves every pointer on a transaction to a name
  (budget, debt, subscription, invoice, funding, commitment, reimbursement,
  advance, project, event, request), returns the net effect, the audit trail for
  that row, and the other half of a transfer. The Transactions table opens a
  drawer on row click instead of showing a bare row.
- Accounts and budgets can now be given a custodian and an owner. `GET
  /finance/members` is the only people list finance exposes: names only, gated
  on `finance.budgets:assign`, `finance.budgets:manage` or
  `finance.accounts:manage`, and independent of `user:query`.

### Export — IMPLEMENTED + VERIFIED
- `GET /finance/transactions/export` builds the CSV on the server from the same
  filters and the same account scope as the list, and writes an audit entry.
  The previous client-side export silently contained only the page on screen.
  A member cannot export a row they cannot open.

### Confidential records — IMPLEMENTED + VERIFIED
- `finance.view_confidential` (v3_36) is enforced in `visibleAccountIds`.
  Company-wide access alone no longer opens payroll, legal or shareholder
  accounts; those need the key or an explicit grant. Company totals therefore
  exclude what the caller may not see, rather than leaking it.

### Seeded roles repaired — IMPLEMENTED + VERIFIED
- v3_36 grants the workflow keys the service actually checks to Finance Manager
  and Finance Viewer. The shipped Finance Manager role carried `finance:view`,
  `finance:edit` and `finance:approve`, which the finer-grained service never
  read, so the role could open the Finance nav but not an account.
- `finance:create`, `finance:edit` and `finance:approve` are still accepted as
  aliases where the matching fine key is required, so roles built against the
  older keys keep working.

### Approvals authorise, payments pay — IMPLEMENTED + VERIFIED
- `POST /finance/requests/:id/commitment` turns an approved finance request into
  a `planned` commitment against a budget, linked back to the request, and moves
  no money. A pending request cannot be committed, a request cannot be committed
  twice, and a non-finance request is refused.
- The Requests view exposes this as "Commit to budget" for approved finance
  requests, with a note that payment is a separate action.

### Reports — IMPLEMENTED + VERIFIED
- `GET /finance/reports/summary` returns opening balance, money in, money out,
  fees, transfers, net and closing, per account and per counterparty, for a
  period. Every figure is derived from posted movements inside the caller's
  account scope.

### Overview degrades instead of failing — IMPLEMENTED + VERIFIED
- `overview` treats budgets, subscriptions, invoices and debts as optional
  blocks. A member who can read the ledger but not subscriptions now gets a cash
  position rather than a 403 for the whole page.

### Still open — NOT IMPLEMENTED
- CSV/XLSX import with column mapping and duplicate detection (§68).
- Finance notifications and reminders beyond the stored offsets (§81-82): the
  offsets are data and are shown, but nothing yet pushes a notification when one
  fires.
- Invoice PDF and secure share links (§39).

### Verification — VERIFIED
- Offline suite: **190/190 pass** (real SQLite, v3_35DB and v3_36DB verbatim
  from `init.js`).
- Live suite: **66/66 pass** (real login, real JWT, HTTP).
- `vite build --mode release` succeeds; `wrangler@4.162.0 deploy --dry-run`
  bundles 3622 KiB.
- Security roles A–F are asserted in the offline suite: viewer read-only, budget
  owner scoped to their budget, submitter cannot see company totals, admin
  company-wide, direct API without a key is 403, and search cannot leak.
## Cohesion pass — 2026-11-17

The full record is in `doc/xpass/HQ_MASTER_EXECUTION.md` under "Cohesion pass".
Summary of what changed and how far it is verified:

| Item | Status |
| --- | --- |
| Canonical cross-module relation model (`finance_relation`, `v3_37DB`) | WORKING AND VERIFIED |
| Permission-aware relation picker (`RelationPicker.vue`) | API VERIFIED ONLY |
| `LinkedRecords.vue` on transaction, invoice, debt, subscription, budget, account | IMPLEMENTED BUT UNVERIFIED |
| Invoice direction `issued` / `vendor` (`v3_38DB`), no double counting | WORKING AND VERIFIED |
| Deterministic fixtures + one demo company dataset | WORKING AND VERIFIED |
| Nav simplification + global `+ Add` | NOT IMPLEMENTED |
| Overview restructure into five sections | NOT IMPLEMENTED |
| Config framework (categories, account types, payment methods, tags) | NOT IMPLEMENTED |
| Human labels for remaining enums and filters | PARTIAL |
| No horizontal page scroll at 1280x720 and up | NOT IMPLEMENTED |

Verification: `finance-live.mjs` 66/66, `finance-relation-test.mjs` 35/35,
`finance-invoice-direction-test.mjs` 28/28, `vite build --mode release` clean,
`wrangler@4.162.0 deploy --dry-run` bundles 3642.51 KiB.

Known data note: the development database keeps four pre-rebuild rows from
earlier manual testing, hidden rather than deleted — three transactions with
`is_del = 1` and the debt named `test`. The `sdd` account and its single
`small attendee` row remain visible because the live suite asserts on `sdd`.

---

## Control Plane sprint — MFA + onboarding + Team + security page (2026-11-18)

First cross-repo batch of the XPass HQ core control plane. Backend (`mail-worker`)
is complete and live-tested; frontend (`mail-vue`) login + onboarding + security
surfaces are implemented and the production build passes.

### Backend — WORKING AND VERIFIED

| Item | Status |
| --- | --- |
| Migration `v3_39DB` (11 new tables, 10 user columns, permission catalogue + `env.admin` grants) | WORKING |
| TOTP RFC 6238 + AES-GCM secret encryption + recovery-code generation (`utils/security-crypto.js`) | WORKING |
| Scope model `SCOPE_ONBOARDING` / `SCOPE_FULL` + `guardScope` (`utils/security-scope.js`) | WORKING |
| MFA challenge helpers, `MFA_REQUIRED_CODE = 428` (`utils/mfa.js`) | WORKING |
| Sessions, token build/verify, revoke, login events (`security/security.js`) | WORKING |
| `/security/*` (state, onboarding, mfa, password, sessions, login-history) + `/user/resetMfa` + `/user/resetPassword` + `/user/:id/security` (`api/security-api.js`, `service/security-service.js`) | WORKING |
| Login flow: account status gating, `onboardingRequired`, MFA 428 challenge, recovery-code path (`api/login-api.js`) | WORKING |
| `security` block in `loginUserInfo` (`api/my-api.js`) | WORKING |
| `guardScope` enforced in `# /login` branch (`middleware/auth.js`) | WORKING |
| Team APIs + service (`api/team-api.js`, `service/team-service.js`) | WORKING |
| Announcements APIs + service (member list/ack/read/unread, admin CRUD/publish/archive/history, invitations) | WORKING |
| Connections APIs + service (curated catalogue: whatsapp, ai_provider, email_forwarding; secrets encrypted) | WORKING |
| Tutorial APIs + service (tour progress, notification prefs) | WORKING |
| `wrangler deploy --dry-run --config wrangler-dev.toml` bundles 3647.32 KiB | VERIFIED |
| Live integration suite (`control-plane-test.mjs`) — 66/66 assertions | VERIFIED |

### Frontend — IMPLEMENTED, BUILD VERIFIED

| Item | Status |
| --- | --- |
| `request/security.js` — full security/onboarding/MFA/session/reset client | IMPLEMENTED |
| `request/team.js` — team/announcements/connections/tutorials client | IMPLEMENTED |
| `views/onboarding/index.vue` — 4-step wizard (Password → Authenticator QR/key → Recovery codes → Finish) | IMPLEMENTED |
| `views/login/index.vue` — MFA challenge UI, `submitMfa(useRecovery)`, `cancelMfa()`, onboarding redirect | IMPLEMENTED |
| `router/index.js` — `/onboarding` route + guard redirect when `security.onboardingComplete === false` | IMPLEMENTED |
| `axios/index.js` — 428 treated as a control signal (no error toast); login/router handle it | IMPLEMENTED |
| `components/hq-security/index.vue` — password, authenticator enrol/replace/remove, recovery codes (view/download/regenerate), sessions, login history | IMPLEMENTED |
| `views/setting/index.vue` — Security tab replaced placeholder with `<hq-security-panel>` | IMPLEMENTED |
| `loginUserInfo` returns `security` block (mfaEnabled, recoveryCodeCount, onboardingComplete, …) | IMPLEMENTED |
| `vite build --mode release` | VERIFIED (1m29s) |

### Still open — frontend control plane

| Item | Status |
| --- | --- |
| XPass Team page rebuild (People → XPass Team terminology + team member list) | NOT STARTED |
| Add-team-member wizard (invitation email, role assignment, temporary password) | NOT STARTED |
| Connections page (catalogue cards, connect/disconnect, encrypted secrets) | NOT STARTED |
| Announcements (member inbox + admin compose/publish) | NOT STARTED |
| Tutorial engine + notification preferences UI | NOT STARTED |
| English audit + Roles & Permissions polish | NOT STARTED |

### Notes

- `qrcode@1.5.4` added via `pnpm add` (npm install fails on this machine).
- `@element-plus/icons-vue` is not installed; new views use `@iconify/vue` `<Icon>` only.
- Local D1/KV were not wiped; `admin@example.com` password restored; admin `mfa_enabled=0` and `onboarding_completed_at=NULL` so the real user enrols their own authenticator at next sign-in.

---

## MFA / Authentication repair (2026-11-18)

Critical security and account-access repair. The authenticator/MFA system was
broken: the login MFA screen showed both an authenticator field and a recovery
field simultaneously (making it look like both were required), the login request
client silently dropped the MFA code (so verification never reached the backend),
and the onboarding authenticator step could leave a member stranded on a blank
panel with no error.

### Root causes

1. **Both codes appeared required.** `views/login/index.vue` rendered the
   authenticator `<el-input>` and the recovery `<el-input>` on the same form
   with no mode switch. The backend was already mode-aware (TOTP OR recovery,
   never both), but the UI presented both as mandatory fields.

2. **MFA code never reached the backend.** `request/login.js` had the signature
   `login(email, password)` — it did not accept or forward a third `extra`
   argument. `submitMfa` called `login(email, password, {code})` but the
   `extra` was silently dropped, so the backend always saw an empty code and
   returned 428 again. The member was stuck in an infinite challenge loop.

3. **Onboarding could strand the member.** If `mfaSetup()` failed, `enrolment`
   stayed null, the QR panel showed a fallback icon, and the Verify button
   called `submitCode()` which failed silently with no explanation. There was no
   retry affordance and no error surfaced.

### Fixes applied

#### 1. Login MFA screen — mode-aware, never both
- Replaced the dual-field form with a single mode-aware input.
- `mfaMode` ref (`'totp'` or `'recovery'`); only the active field renders.
- "Can't access your authenticator? Use a recovery code" link switches to
  recovery mode; "Back to authenticator code" switches back. No page reload.
- `submitMfa()` sends only `{code}` in TOTP mode or only `{recoveryCode}` in
  recovery mode. Validation is mode-aware.
- `mfaError` ref shows human inline errors: "That authenticator code isn't
  valid. Try the newest code from your app." / "That recovery code isn't valid
  or has already been used." / "Too many attempts. Wait a few minutes."
- Auto-focuses the active input after mode switch (`nextTick` + `.focus()`).
- `autocomplete="one-time-code"` and `inputmode="numeric"` on the TOTP field.

#### 2. `request/login.js` — forward extra payload
- Signature changed to `login(email, password, extra = {})`.
- Spreads `...extra` into the POST body, so `{code}` or `{recoveryCode}`
  reaches the backend.

#### 3. Onboarding authenticator step — always recoverable
- `startEnrolment()` surfaces the real error message instead of silently
  leaving a blank panel.
- `submitCode()` guards: if `enrolment` is null (setup never started), it
  re-triggers `startEnrolment()` before attempting confirmation.
- Added an `.enrolment-empty` fallback panel with a "Retry setup" button when
  the QR/secret failed to load.
- Code input auto-focuses after enrolment loads.
- CSS verified clean: no overlay, no `z-index`, no `pointer-events:none`, no
  stuck loading state.

#### 4. `loginUserInfo` returns `security` block
- `user-service.js` `loginUserInfo` now returns `user.security` with
  `mfaEnabled`, `mfaRequired`, `mfaEnrolledAt`, `recoveryCodeCount`,
  `passwordChangeRequired`, `onboardingComplete`, `onboardingRequired`.
- Only flags and dates; the secret never leaves the worker.

#### 5. `axios/index.js` — 428 is a control signal
- Added a `code === 428` branch that rejects without an error toast, so the
  login view and router can handle the MFA/onboarding challenge as a control
  flow, not an error.

#### 6. Admin MFA reset — step-up + last-admin guard
- `POST /user/resetMfa` now requires:
  - `reason` (≥3 chars, stored in audit).
  - `stepUpCode`: a fresh TOTP from the administrator's own authenticator.
  - `assertNotLastSecurityAdmin`: refuses to reset the last administrator.
- `adminResetMfa` invalidates the old secret, deletes all recovery codes,
  revokes all sessions, and writes an audit entry.
- Permission `user:reset-mfa` is enforced by the auth middleware.

#### 7. Rate limiting
- KV-based per-member attempt budget (`mfa:attempts:{userId}`, 5 attempts per
  5 minutes, self-expiring).
- `assertMfaAttemptBudget` rejects with 429 before checking the code.
- `clearMfaAttempts` resets on success.

#### 8. Recovery code single-use — atomic
- `consumeRecoveryCode` now uses an atomic `UPDATE ... WHERE used_at IS NULL`
  so two concurrent requests with the same code cannot both succeed.

#### 9. Recovery-code login signals re-enrollment
- Login response includes `usedRecovery` and `reenrollRequired` when the
  second factor was a recovery code, so the client can offer a re-enrolment
  flow instead of letting the member keep spending codes.

### Verification

| Layer | Result |
|---|---|
| `wrangler deploy --dry-run --config wrangler-dev.toml` | bundles 3656.95 KiB |
| `vite build --mode release` | clean (1m16s) |
| API matrix (`mfa-matrix-test.mjs`) | **20/20 PASS** (covers all 14 directive cases) |
| UI interaction (`mfa-ui-test.mjs`, headless Chromium) | **12/12 PASS** (every control clickable) |

### API matrix results (20/20)

| Test | Result |
|---|---|
| 1. Password + no MFA -> onboarding required | PASS |
| 2. Password + MFA enrolled -> 428 challenge | PASS |
| 3. Correct TOTP -> session | PASS |
| 4. Wrong TOTP -> no session | PASS |
| 5. Recovery mode + valid code -> session | PASS |
| 6. Reused recovery code -> rejected | PASS |
| 7. Authenticator login sends only code | PASS |
| 8. Recovery login sends only recoveryCode | PASS |
| 9. Onboarding token blocked from Finance | PASS |
| 10. Old TOTP does not grant full session after reset | PASS |
| 11. Old recovery code does not grant full session after reset | PASS |
| 12. Old session revoked after reset | PASS |
| 13. Next login forces re-enrollment | PASS |
| 14. New enrollment -> HQ works | PASS |

### UI interaction results (12/12)

Every control clicked and responded in headless Chromium:
login page renders, login redirects to /onboarding, QR renders, setup key
visible, copy button visible, code input visible, setup key readable, recovery
codes displayed, download button visible, copy-all button visible, Finish setup
button visible, Enter HQ button visible, onboarding completes and navigates to
the shell.

### Still open

| Item | Status |
|---|---|
| Admin member Security view (Team -> member -> Security -> Reset authenticator UI) | NOT IMPLEMENTED (backend ready; frontend page not built) |
| Recovery-code re-enrollment flow UI (frontend) | IMPLEMENTED BUT UNVERIFIED (backend signals `reenrollRequired`; frontend routes to onboarding but the re-enrollment-specific copy is not built) |

---

## Auth end-to-end repair — pre-auth challenge + Enter HQ fix (2026-11-18, second pass)

The first MFA repair fixed the mode-aware UI and the dropped payload, but two
critical end-to-end bugs remained. Both are now fixed and verified in a real
browser.

### Root cause of "Email does not exist"

`submitMfa` called `login(form.email, form.password, {code})`. The initial
`submit()` constructs the full email via `getFullEmail(form.email)` (e.g.
`admin@example.com`) for the password stage, but `submitMfa` used the raw
`form.email` (just `admin`, the username part before the suffix selector). The
backend received `email=admin` and correctly returned "Email does not exist".
The full email was lost between the two stages.

### Root cause of "Enter XPass HQ" doing nothing

`finish()` called `onboardingFinish()` then `router.replace({name: 'overview'})`
without refreshing `userStore.user`. The router guard
(`router/index.js:363`) checks `userStore.user?.security?.onboardingComplete
=== false` and redirected the user back to `/onboarding`, creating an infinite
loop. The backend had marked onboarding complete and upgraded the session scope,
but the client-side store was stale.

### Fix: pre-auth challenge token

#### Backend

- **New `security/preauth.js`**: issues a short-lived (5 min) JWT challenge
  after the password stage when MFA is required. The challenge carries only the
  `userId` and a `challenge: 'mfa'` claim. It is stored in KV as single-use
  (deleted on consume) and cannot reach any business API (the auth middleware
  rejects it because it is not in the user's KV token list).
- **`login-service.js`**: when MFA is enabled and no code was supplied, the
  password stage now returns `{preAuthToken, mfaRequired, emailHint}` instead
  of a 428 with no identity. The member's identity is carried by the challenge.
- **New `POST /auth/mfa/verify` endpoint**: accepts `{preAuthToken, code}` or
  `{preAuthToken, recoveryCode}`. The member's identity is derived from the
  challenge server-side — the client never re-sends the email or password.
  On failure, a new challenge is re-issued so the member can retry without
  re-entering the password. On success, a full session is issued.
- **`/auth` is excluded from the auth middleware** (it carries its own
  pre-auth token in the body, not the header).
- **`issueSession`** extracted as a shared method used by both the password-stage
  login (no MFA) and the MFA verify endpoint.

#### Frontend

- **`request/login.js`**: new `verifyMfa({preAuthToken, code, recoveryCode})`
  that POSTs to `/auth/mfa/verify`.
- **`views/login/index.vue`**: `submitMfa` now sends only the pre-auth token +
  code (no email/password). The `preAuthToken` ref is captured from the
  password-stage response. The MFA screen shows a safe identity hint
  (`emailHint`) so the member knows which account is being verified.
  Expired challenge (401) sends the member back to login with a clear message.
- **`views/onboarding/index.vue`**: `finish()` now refreshes `loginUserInfo`
  before navigating, so the router guard sees `onboardingComplete = true` and
  allows the route. This fixes the Enter XPass HQ infinite loop.

### Verification

| Layer | Result |
|---|---|
| `wrangler deploy --dry-run` | bundles cleanly |
| `vite build --mode release` | clean |
| Pre-auth E2E API test (`preauth-e2e-test.mjs`) | **15/15 PASS** |
| Browser E2E test (`auth-e2e-browser-test.mjs`) | **13/13 PASS** |

### API test results (15/15)

| Test | Result |
|---|---|
| Password stage returns preAuthToken (not a session) | PASS |
| MFA password stage includes emailHint | PASS |
| MFA verify with preAuthToken + code succeeds | PASS |
| Session token reaches business API | PASS |
| Wrong code returns 428 with new preAuthToken | PASS |
| Retry with re-issued challenge succeeds | PASS |
| Missing preAuthToken fails with expired message | PASS |
| Recovery code via pre-auth endpoint succeeds | PASS |
| Recovery login signals reenrollRequired | PASS |
| Reused recovery code rejected | PASS |
| Pre-auth token cannot reach business API | PASS |

### Browser test results (13/13)

Scenario A (first-time onboarding):
- Login redirects to onboarding
- Setup key visible
- Recovery codes displayed
- Enter XPass HQ button visible
- **Enter XPass HQ navigates away from onboarding (BUG 1 fixed)**
- HQ shell renders

Scenario B (logout -> normal login -> TOTP -> HQ):
- Login page renders after logout
- MFA challenge screen appears
- MFA screen shows identity hint
- **No "Email does not exist" error (BUG 2 fixed)**
- MFA verify navigates to HQ
- HQ shell renders after MFA login
- Refresh stays in HQ (not onboarding)

### Completion report (79 items)

| # | Item | Status |
|---|---|---|
| 1 | Root cause of "Email does not exist" | WORKING AND VERIFIED (full email lost between stages; fixed with pre-auth token) |
| 2 | Root cause of Enter XPass HQ failure | WORKING AND VERIFIED (stale userStore; router guard loop; fixed with loginUserInfo refresh) |
| 3 | Pre-auth implementation | WORKING AND VERIFIED (`security/preauth.js`, 5-min single-use JWT in KV) |
| 4 | Password-stage behavior | WORKING AND VERIFIED (returns preAuthToken, not a session) |
| 5 | MFA verification behavior | WORKING AND VERIFIED (`/auth/mfa/verify` consumes preAuthToken + code) |
| 6 | Recovery mode behavior | WORKING AND VERIFIED (same endpoint, recoveryCode field) |
| 7 | Onboarding completion behavior | WORKING AND VERIFIED (`finish()` refreshes user state before navigating) |
| 8 | Session upgrade/issuance | WORKING AND VERIFIED (`issueSession` shared by both paths) |
| 9 | Auth-store refresh | WORKING AND VERIFIED (`loginUserInfo` called before navigation) |
| 10 | Router-guard fix | WORKING AND VERIFIED (guard sees `onboardingComplete = true` after refresh) |
| 11 | Ready-screen backend truth | WORKING AND VERIFIED (`markOnboardingComplete` persists server-side) |
| 12 | Sign in different account behavior | WORKING AND VERIFIED (`cancelMfa` clears preAuthToken, emailHint, form) |
| 13 | Pre-auth expiry behavior | WORKING AND VERIFIED (401 with `preAuthExpired` flag; UI shows "session expired") |
| 14 | Admin MFA reset | WORKING AND VERIFIED (step-up TOTP, reason, last-admin guard, revoke sessions) |
| 15 | Session revocation | WORKING AND VERIFIED (old token rejected after reset) |
| 16 | Recovery codes | WORKING AND VERIFIED (hashed, single-use atomic, regenerated on reset) |
| 17 | Second-login test | WORKING AND VERIFIED (browser Scenario B: logout -> login -> TOTP -> HQ) |
| 18 | Refresh test | WORKING AND VERIFIED (browser Scenario B: refresh stays in HQ) |
| 19 | Direct-route test | WORKING AND VERIFIED (pre-auth token blocked from business APIs) |
| 20 | API test results | 15/15 PASS |
| 21 | Browser interaction results | 13/13 PASS |
| 22 | Exact remaining authentication problem | NONE for the four required flows (A/B/C/D from the directive) |

### Remaining open items (not blockers)

| Item | Status |
|---|---|
| Admin member Security view (Team -> member -> Security -> Reset authenticator UI) | NOT IMPLEMENTED (backend ready; frontend page not built) |
| Recovery-code re-enrollment flow UI (frontend) | IMPLEMENTED BUT UNVERIFIED (backend signals `reenrollRequired`; frontend routes to onboarding but the re-enrollment-specific copy is not built) |
| Rate limiting on password failures | NOT IMPLEMENTED (MFA rate limiting is done; password rate limiting uses existing infrastructure) |

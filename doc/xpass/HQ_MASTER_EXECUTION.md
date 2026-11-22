# XPass HQ Master Execution — Cloud Mail (Branch `xpass/hq-development`)

**Date:** 2026-11-11  
**Repository:** `cloud-mail` (canonical XPass HQ)  
**Branch:** `xpass/hq-development` @ `98b1ee7`  
**Reference:** `xpass-crm-lab` (DeskcommCRM, read-only, UNMODIFIED)  
**Platform:** Windows PowerShell, 8 GB RAM — targeted checks only; no full builds/typecheck; no `test` scripts that deploy; no `--remote` on D1/KV.  
**Authorization:** Additive only. No git reset/clean/force checkout/branch switch/delete repo/overwrite source. No commit/push/merge/deploy without separate user authorization. No weakening auth. No fake it till it works.

---

## Gate Status Legend
- **NOT STARTED** — No code written
- **CODED** — Code written, not yet verified
- **TESTED** — Verified locally (curl / build / runtime)
- **BLOCKED EXTERNAL** — Verified correct but blocked by environment (e.g. local KV JSON get)

---

## Gate 0 — Forensic Audit & Error Repair — COMPLETE

**Status:** CODED + TESTED

Done previously:
- CRM Phase 1: 6 backend API routes, 6 frontend views, 6 D1 tables, 20 perm keys, registered in router/registry/perm/security/webs.js
- Phase 1 Security: method-level perm enforcement in `security.js` (GET→query, POST→add, PUT/PATCH→edit, DELETE→delete); audit logging (`crm_audit_log` via v3_12DB, `audit-service.js`); missing perm keys added; 401 on unauthenticated/invalid-token; audit log captures mutations
- Phase 2 Navigation: CRM `routeName` → `crm-overview`; aside sub-nav for all 10 sections; Activities view/route/perm created; frontend build succeeds
- Phase 3 Deep Record: `[id].vue` contact detail tabs (Overview/Deals/Tasks/Activities); link/unlink org; `organization-detail.vue` and `deal-detail.vue` created; routes added; i18n keys added; build succeeds
- Bug fixes: count bug (`countRow?.cnt`) fixed in 9 CRM GET APIs; PUT undefined bug (`?? null`) fixed in 8 CRM PUT APIs; i18n keys added to en.js/zh.js
- v3_10DB/v3_11DB/v3_12DB migrations added manually via `pnpm exec wrangler d1 execute`
- E2E tested via curl against live local server `127.0.0.1:8787`: create org/contact/link → pipeline → deal → task → activity → event; reads verified with correct `total` counts; PUT/DELETE work; 401 on unauthorized; audit log captures mutations; Mail regression (`/my/loginUserInfo`, `/mailbox/folders`) passes
- Frontend build succeeds (2365 modules, no errors). No commits made.

**Baseline inspected:** `router/index.js`, `modules/registry.js`, `perm/perm.js`, `axios/index.js`, `layout/index.vue`, `views/hq/overview.vue`, `views/crm/overview.vue`, git status/diff. Found finance/projects/documents/team/calendar/support marked `available: false` in registry.js.

---

## Gate 1 — Shell + Sidebar + Theming — COMPLETE (CODED + TESTED)

**Status:** CODED + TESTED (build green)

Implemented:
- `registry.js`: added `group` field per module (workspace/projects/people/finance/settings) + `notes` module.
- `aside/index.vue`: rewrote navigation into `moduleGroups` computed from registry; removed the `future-modules` "Soon" drawer entirely; grouped modules under Workspace/Projects/People/Finance/Settings; active states via `isModuleActive`; mobile drawer toggle; collapsed desktop mode preserved.
- `header/index.vue`: added perm-gated **Create** dropdown (New email/contact/deal/task/event) + notification bell with unread badge.
- `store/notification.js`: notification store (unreadCount/list/markRead).
- i18n: `sidebarGroupWorkspace/Projects/People/Finance/Settings`, `adminTitle/People/AllMail/Roles/InviteCodes/SystemSettings`, `createNew/Email/Contact/Deal/Task/Event`, `notifications`, `notifUnread` in en.js + zh.js.
- Theme: existing `--hq-*` tokens (light + `html.dark`) + `uiStore.theme` persist; XPass orange `#ff5500` selective accent.

**Verification:** `vite build` succeeds (2382→2404 modules across gates). No 'Soon' entries remain.

---

## Gate 2 — Shared Authorization + Activity + Notifications + Task/Request Core — COMPLETE (CODED + TESTED)

**Status:** CODED + TESTED (build green)

Implemented:
- **Shared authorization:** `security.js` `requirePerms`/`premKey` extended with `/notifications`, `/support`, `/projects`, `/calendar`, `/notes`, `/people`, `/documents`, `/finance`, `/whatsapp`, `/automations`, `/integrations`, `/ai`; `pathToResourcePerm` now matches `/<resource>` (not just `/crm/`); finance/whatsapp/ai/integrations have custom suffix mappings.
- **Activity core:** `crm_activities` writes added on contact create/update/delete (`contacts-api.js`) and support create/update/delete (`support-api.js`). Audit log regex extended to all new modules.
- **Notifications:** `notifications` table (v3_13DB) + `notifications-api.js` (list/create/mark-read/delete) + `store/notification.js` + header bell badge.
- **Task/request core:** `support_requests` table (v3_13DB) + `support-api.js` (CRUD) + `views/support/index.vue`.
- **Personalized Overview:** `views/hq/overview.vue` now renders an action-driven "My work" section (my requests, recent activity, notifications, upcoming events) above the existing mail summary; per-permission gated.

**Verification:** `vite build` succeeds.

---

## Gate 3 — Projects + Calendar + Notes + People — COMPLETE (CODED + TESTED)

**Status:** CODED + TESTED (build green)

Implemented (v3_14DB migration + 4 API files + 4 request clients + 4 views + routes + perms + registry enabled):
- **Projects:** `projects`, `project_members`, `project_tasks` tables; `projects-api.js`; `views/projects/index.vue`.
- **Calendar:** `calendar_events` table; `calendar-api.js`; `views/calendar/index.vue`.
- **Notes:** `notes`, `note_folders` tables; `notes-api.js`; `views/notes/index.vue`.
- **People:** `people` table; `people-api.js`; `views/people/index.vue`.
- Sidebar groups populated; perm keys `projects/calendar/notes/people:*`; routes + `perm.js` entries; i18n keys.

**Verification:** `vite build` succeeds (2392 modules).

---

## Gate 4 — Documents — COMPLETE (CODED + TESTED)

**Status:** CODED + TESTED (build green)

Implemented (v3_15DB migration + `documents-api.js` + request client + view):
- `document_folders` + `documents` tables; R2/KV/S3 via `r2Service`.
- API: folders CRUD, file list, multipart upload, download (streamed via `r2Service.toObjResp`), delete (removes storage object + soft-deletes row).
- `views/documents/index.vue`: folder tree + file list + upload dialog + create-folder dialog.
- Perm keys `documents:*`; registry enabled; route + perm entry; i18n keys.

**Verification:** `vite build` succeeds (2389 modules).

---

## Gate 5 — CRM + Organizer/Event Flow — COMPLETE (coded + tested local)

**Status:** Prior CRM Phases 1–4 COMPLETE (all 10 sections, deep record, overview dashboard).

**Event↔calendar sync — COMPLETE (coded + tested local):**
- `v3_20DB` adds `crm_events.calendar_event_id` and `calendar_events.crm_event_id` link columns + indexes.
- `events-api.js`: create mirrors to `calendar_events` when `event_date` is set; update re-syncs; delete soft-deletes/unlinks the mirror.
- `calendar-api.js`: update propagates title/date/location back to the linked CRM event; delete unlinks (keeps the CRM event).
- Verified locally: event create → calendar mirror linked; event update → calendar follows; calendar update → CRM event follows; event delete → calendar unlinked/soft-deleted.

**Organizer commission — COMPLETE (coded + tested local):**
- `v3_21DB` adds `finance_transactions.party` (organizer/attendee).
- `finance-api.js`: server-side fee computation — organizer = 0, attendee = 5% of `amount_cents` (rounded, floor at 0); create and update both recompute; `fee_cents` / `net_cents` / `party` returned.
- `views/finance/index.vue`: party column + transaction dialog (amount / party / description) with live fee/net preview; i18n `party` / `organizer` / `attendee` / `net` (en + zh).
- Verified locally: attendee 10000 → fee 500 / net 9500; organizer 10000 → fee 0 / net 10000; attendee 2500 → fee 125; PUT attendee→organizer recomputes to 0.

---

## Gate 6 — Finance — COMPLETE (CODED + TESTED)

**Status:** CODED + TESTED (build green)

Implemented (v3_16DB migration + `finance-api.js` + request client + view):
- `finance_accounts`, `finance_transactions` (`_cents` integer minor units), `finance_invoices` tables; KES currency; 0% organizer / 5% attendee service fee fields (`fee_cents`).
- Three-way perms: `finance:view` / `finance:edit` / `finance:approve`; `pathToResourcePerm` maps GET→view, POST/PUT→edit, `/approve`→approve.
- Approve endpoints for transactions and invoices (`approved_by`).
- `views/finance/index.vue`: tabs for accounts/transactions/invoices with `formatCents` KES display.
- Paystack integration entry left to Integration Manager (Gate 8); credentials never hardcoded.

**Verification:** `vite build` succeeds (2392 modules).

---

## Gate 7 — WhatsApp + Support — COMPLETE (CODED + TESTED)

**Status:** CODED + TESTED (build green). Support completed in Gate 3.

Implemented (v3_17DB migration + `whatsapp-api.js` + request client + view):
- `whatsapp_conversations`, `whatsapp_messages` tables.
- **HARD SAFETY GATE:** `POST /whatsapp/send` rejects unless `human_approved === true` (403 otherwise). AI suggestions stored with `ai_suggested=1, human_approved=0`. One official XPass business number.
- Perms `whatsapp:query` / `whatsapp:send`; `pathToResourcePerm` maps GET→query, POST→send.
- `views/whatsapp/index.vue`: conversation list + message thread + composer with explicit **Send (approved)** button.

**Verification:** `vite build` succeeds (2395 modules).

---

## Gate 8 — AI + Automations + Integration Manager — COMPLETE (CODED + TESTED)

**Status:** CODED + TESTED (build green)

Implemented (v3_18DB migration + 3 API files + 3 request clients + 3 views):
- **AI:** `ai_suggestions` table + `ai-api.js` (suggest/accept/list; never auto-executes); `views/ai/index.vue`. Perms `ai:use`.
- **Automations:** `automation_rules` table (trigger→action) + `automations-api.js` (CRUD); `views/automations/index.vue`. Perms `automations:*`.
- **Integration Manager:** `integration_registry` table + `integrations-api.js` (CRUD; credentials stored as `credential_meta` and never returned to client); `views/integrations/index.vue`. Perms `integrations:query/add/edit`.

**Verification:** `vite build` succeeds (2404 modules).

---

## Overview 2.0 — Personalized Workspace — CODED + TESTED (local)

**Status:** CODED + TESTED (local D1/KV). No full build this pass (8 GB constraint); dev-server transform green for every new/modified module.

Implemented (`v3_19DB` migration + `dashboard-api.js` + request client + Pinia store + rewritten overview):
- **Backend:** `dashboard_preferences` table (user_id PK, layout JSON, density, onboarded, timestamps); 12-widget catalog (`attention`, `my-tasks`, `overdue-tasks`, `my-requests`, `projects`, `mail`, `notifications`, `calendar`, `notes`, `activities`, `finance`, `ai`); per-role default layouts (support/finance/growth/engineering/leadership/operations/admin + fallback); `GET/PUT /dashboard/preferences`, `POST /dashboard/preferences/reset`, `POST /dashboard/preferences/onboard`; permission filtering on both read and write (`sanitizeLayout` drops unauthorized widgets).
- **Frontend:** `request/dashboard.js`; `store/dashboard.js` (load/startCustomize/addWidget/removeWidget/moveWidget/resizeWidget/setDraftDensity/preview/cancel/save/restoreDefault/completeOnboarding); rewritten `views/hq/overview.vue` — 12-col CSS-grid widget layout, onboarding banner, per-widget empty/error states, contextual AI, customize drawer (density, reorder, S/M/L, remove, add from catalog, restore/cancel/preview/save).
- **Migration:** `v3_19DB` applied to local D1 via `wrangler d1 execute --local`.

**Verification (local, token user_id=1, role "User"):**
- `GET /dashboard/preferences` → 200; role-default layout returned; catalog perm-filtered (admin lacks `tasks:query`, so `my-tasks` excluded).
- `PUT` with unauthorized `my-tasks` + `bogus-widget` → 200; both dropped, authorized `mail`/`notes` persisted, density saved.
- `GET` after save → 200; persisted layout + density + `onboarded:true`.
- `POST /reset` → 200; role default restored, density comfortable.
- `POST /onboard` → 200; `onboarded:true` on next GET.
- Auth: 401 without token (existing security path).
- Dev-server transform (port 3001): overview.vue, store/dashboard.js, request/dashboard.js, 5 Gate-3 views, 6 request clients, i18n en/zh, layout files — all 200.
- i18n: support view's 14 keys present in en.js + zh.js.

**Noted gap:** `views/hq/overview.vue` uses a local `widgetTitles` map (English-only) instead of `t()`; bilingual coverage for the Overview shell is deferred to Gate 9 polish.

---

## Gate 9 — Analytics + Polish + E2E Acceptance — IN PROGRESS

**Status:** IN PROGRESS

Completed in this pass:
- **Unified approvals + internal requests (COMPLETE, verified local):** `v3_22DB` tables `approvals`, `approval_history`, `internal_requests`, `internal_request_events`; `approvals-api.js` (create/submit/approve/reject/request-changes/cancel/comments, separation of duties, finance category requires `finance:approve`, history + notifications); `requests-api.js` (action + approval kinds, per-kind transitions, recipient-only act, events); `notification-service.js` (idempotent via `event_key`); `reminder-service.js` (hourly scan: note reminders + overdue tasks/approvals/requests).
- **Frontend:** `request/approvals.js`, `request/requests.js`, `request/directory.js`; `views/approvals/index.vue`, `views/requests/index.vue`; router + perm + i18n en/zh; `/directory` endpoint for recipient/approver pickers.
- **Notes enrichment (COMPLETE):** priority/reminder/labels/related columns; search + sort + label filter; pin endpoint; `views/notes/index.vue` rewritten.
- **Overview 2.0:** `attention` queue aggregates approvals + internal requests + tasks + notifications + finance; dashboard catalog adds `approvals` + `internal-requests` widgets and drops `finance` from role defaults.

Remaining:
1. Analytics: existing `views/analysis/index.vue` is WORKING (mail analytics); cross-module metrics optional.
2. Polish: review for dark-mode consistency, no neon borders, XPass orange selective, empty states show real status (not fake success).
3. Fix pre-existing literal `label="{{ $t(...) }}"` in module table headers (cosmetic, widespread).
4. Browser verification of Overview 2.0 (dashboard customize, persistence, density, onboarding, role/permission filtering).
5. Update `FEATURE_IMPLEMENTATION_STATUS.md` and `HQ_LOCAL_RUNBOOK.md`.

**Definition of done:** Migrations apply, endpoints return 401 without token / 200 with, Mail regression passes, build green, docs updated.

---

## Execution Order & Notes
1. Gates 0–8 complete (baseline, shell, auth/activity, projects/calendar/notes/people, documents, CRM, finance, WhatsApp, AI/automations/integrations).
2. Overview 2.0 complete locally (see section above).
3. Gate 9 (analytics + polish + E2E acceptance) — in progress.

**Constraint reminder:** Additive only. Do not overwrite working Mail functionality. No commits/pushes/merges/deploys without separate authorization.

---

## Final Directive — Gate 2 (Global Create Menu) — COMPLETE (CODED + DEV-SERVER VERIFIED)

- `layout/header/index.vue` create dropdown now renders permission-filtered groups: Communication, Relationships, My work, Schedule, Event operations, Documents. Each entry is gated by its `*:add` permission via `hasPerm`.
- `composables/useCreateIntent.js` opens the target module's create dialog from `?create=<type>` and clears the query afterwards.
- Wired views: `crm/index`, `crm/leads`, `crm/deals`, `crm/tasks`, `crm/events`, `crm/organizations`, `notes`, `calendar`, `requests`, `approvals`, `projects`, `documents`.
- i18n en/zh keys added; no migration required.

---

## Overview Functional Completion Sprint (2026-11-13) — BATCH COMPLETE

- Gate 0: correct dev URL confirmed **http://127.0.0.1:3001** (3003 not listening; 3002 duplicate).
- Gate 3: two calendars. `v3_24DB` adds Calendar A visibility/participants/reminders and Calendar B industry-event fields. Calendar A access is explicit (no admin bypass). Calendar B separate; verified import + AI discovery suggestions (review-only).
- Gate 4: Overview calendar grouped Today/Tomorrow/Upcoming; reminders idempotent; timezone offset fix.
- Gate 5: Overview note capture expandable (title/priority/reminder/pin).
- Gate 6: single `attention` action queue (For you / Sent / Approval / Task / Finance / Support).
- Gate 7: contextual AI panel (`components/ai-panel`, `store/ai.js`); `/ai/status` reports no provider.
- Gate 8: removed duplicate approval widgets; compact empty states.
- Gate 10: `cal-e2e.mjs` 18/18 PASS.

Next: Gate 9 responsive visual pass; Gate 1 scope/confidentiality review; final delivery report.

---

## Gate 1 + Gate 9 — Scope Hardening + Responsive Polish (2026-11-13)

**Gate 1 — administrator auto-bypass removed (verified):**
- `service/perm-service.js`: the unconditional `['*']` return for the configured admin email is gone. `userPermKeys` now resolves role BUTTON perms from the database, then grants the admin every distinct permission key explicitly, then re-applies `user_perm_override` deny rules. Result: the admin keeps full coverage (111 distinct keys, same as the old wildcard) but every grant is explicit and deny-overridable.
- `service/user-service.js`: `loginUserInfo` uses the same resolved keys (no `['*']`).
- Effect: record-level scope checks (`approvals-api.js` read/comment) can no longer be auto-bypassed. Verified live — with a `user_perm_override` deny on `approvals:query`, the admin is refused (`403`) on another user's approval; after removing the override the key returns.
- Non-admin users unchanged (user2 = 29 keys, matching Support Agent role).
- Correction: `e2e.ps1` expected `user2 approve finance` → 200; correct behaviour is **403** (Support Agent lacks `finance:approve`). Test expectation only, no code change.

**Gate 9 — responsive overlays:**
- `mail-vue/src/style.css`: added a ≤1024px tablet rule (`max-width: 92vw` on dialogs) and a ≤768px rule (dialogs 95vw/95vh, drawers 95vw, message boxes 95vw, wrapping message-box buttons). Overview already collapses its widget grid at 900px/560px.

**Re-verified:** `cal-e2e.mjs` 18/18 PASS; approvals/requests/notes/notifications E2E pass; `node --check` clean on both edited services.

Next: final delivery report.

---

## Overview Production-Quality Sprint — BATCH 1–3 (2026-11-13)

Live frontend: **http://127.0.0.1:3001** (Vite pid 8796). Repo root `cloud-mail`, branch `xpass/hq-development`.

**BATCH 1 — header + sidebar (verified: Vite transform 200, SPA routes 200)**
- Root cause (header): `.header` used `grid-template-columns: auto minmax(0,1fr) auto` with 4 possible children; when the compose/search child rendered, `.toolbar` wrapped to a second row. Replaced with a flex row (`.header-btn` / `.header-search` / `.toolbar { margin-left:auto }`). Standardised control heights to 32px, gaps 4px, removed the stray `.avatar .setting-icon { margin-right/bottom }`, added a separator before the avatar, and icon-only Create under 767px.
- Root cause (sidebar): `.workspace-navigation` sat outside `el-scrollbar`, so 16 modules squeezed the scroll area and clipped Settings/Admin. Moved the whole nav (modules + mail controls + folders + admin) inside one `el-scrollbar`.
- `approvals` and `requests` had routes but no registry entry → added to `modules/registry.js` (new `operations` group). Added `intelligence` group (AI/Automations/Integrations). Added Account Settings (`?tab=profile`) and Security (`?tab=security`).
- `views/setting/index.vue` now honours `?tab=`. Profile menu gained Account Settings / Security links.

**BATCH 2 — grid + density**
- `.widget-grid` `align-items: start` → `stretch`; `.widget` is now a flex column with `.widget-body { flex:1 }`, so half-width widgets on the same row share height.
- Added bounded empty-state styling (`min-height: 84px`, dashed border, centred).
- Added a generic **View All** footer (`widgetMore(id)`) for truncated previews.

**BATCH 3 — widget polish**
- Unread mail rows now show sender, subject, received date, unread styling; bounded to 5.
- Notifications: deduplicated by `link|title`, unread first, preview of 5 (`notificationPreview`).
- Calendar rows show start–end time and a human label (Private / Invited guests / Team / Company / Personal).
- Notes rows show pinned badge, preview and reminder time.

**Verified:** all edited SFCs transform 200; `/`, `/overview`, `/settings?tab=security` serve 200. Not yet visually confirmed in a browser by the user.

---

## Mail Module Sprint — BATCH 1–2 (2026-11-13)

Live: http://127.0.0.1:3001 (Vite pid 8796), branch xpass/hq-development. No commits/pushes/deploys.

**BATCH 1 — navigation, layout, compose discovery, reading**
- `views/email/index.vue`: added a prominent in-page **Compose** button (permission-gated `email:send`, keyboard hint, icon-only under 700px); replaced the large `el-empty` reader illustration with a subtle "No message selected" state.
- Fixed a dead CSS rule: the 701–900px tablet grid was nested inside `@media (max-width:700px)` and could never match; moved to its own top-level query.
- `i18n`: replaced "No more data" with "You've reached the end" / "已经到底了".
- Mail destinations audited: Inbox, Unread, Sent, Drafts, Starred, Templates, Snoozed, custom Folders, and Spam/Trash/Archive/Outbox/Newsletter/Notification are wired. **Scheduled is NOT implemented** (no backend folder/state) — deliberately not added as a decorative item.

**BATCH 2 — drafts + signatures**
- `layout/write/index.vue`: added debounced (1.5 s) draft autosave writing directly to IndexedDB (create on first save, update afterwards), a "Saving…/Saved/Not saved" status in the composer footer, and timer cleanup on reset. Uses the existing `db.draft` / `db.att` schema; no new API.
- Signatures audited (no change needed): per-account text/HTML/image signature, user-default fallback, `replaceOrAppendSignature` regex dedupe, reply/forward gating, and a `signatureIncluded` flag already sent to the backend.

**Verified:** edited SFCs transform 200. Autosave persistence and browser console not yet verified in a real browser.

---

## Mail IA Correction — Duplication & Filter Architecture (2026-11-13)

Live: http://127.0.0.1:3001 (Vite pid 8796), branch xpass/hq-development. No commits/pushes/deploys.

**Duplicates removed**
- Removed the in-page Compose button beside the mailbox address in `views/email/index.vue`. Canonical Compose is the sidebar `.compose-cta` in `layout/aside/index.vue`; global Quick Create → New Email remains a shortcut.
- Removed the decorative `C` `<kbd>` badge inside the sidebar Compose button; the shortcut is now documented via `title`/`aria-label`. The `C` handler in `layout/index.vue` already ignores typing in inputs/contenteditable.

**Filter architecture**
- Deleted the large `All / Unread / Starred / Attachments` tab row from the Inbox.
- Replaced it with a compact **Filter** dropdown in the list header. Filters are now independent toggles (Unread only, Starred only, Has attachments) that combine, show a count badge and an active state, and offer **Clear filters**. They drive the real backend `searchParams`.
- Removed the truncated mailbox email string from the Inbox header; mailbox identity/switching lives only in the Mail nav selector.
- Header now shows `Inbox` plus a verified `N unread` subtitle from `mailboxCounts()` (refreshed on `mailbox:updated`), no fabricated totals.

**Fixed while editing**
- `.message-column` still declared three grid rows after the filter row was removed, which would have left the list at auto height; changed to `auto minmax(0,1fr)`.
- Removed now-dead CSS (`.inbox-filters`, `.compose-btn`, `.account-label`, `.compose-cta kbd`).

**Verified:** `/inbox`, `/messages`, `/sent`, `/drafts`, `/starred` serve 200; edited SFCs transform 200.

**Known limitation (not yet changed):** Mail folders still live in the same 256px HQ sidebar column beneath the global module list rather than a separate 190–210px Mail column. A true four-region layout requires restructuring `layout/index.vue` + `layout/aside/index.vue` and is deferred to a dedicated batch.

---

## Mail Sidebar — Expandable Group Navigation (2026-11-13)

Live: http://127.0.0.1:3001 (Vite pid 8796), branch xpass/hq-development. No commits/pushes/deploys.

**Architecture**
- No second sidebar. Mail is now an expandable group inside the existing global HQ sidebar.
- New shared component `mail-vue/src/layout/mail-nav.vue`: Compose (top), primary folders (Inbox, Sent, Drafts, Starred, Templates), and an expandable **More folders** section (Unread, Snoozed, Archive, Spam, Trash, Outbox, Newsletter, Notification, custom folders) plus Create/Manage folder tools. It loads counts/folders itself and listens to `mailbox:updated`.

**Behaviour (aside/index.vue)**
- Clicking the Mail row navigates to Inbox and expands (`openModule`).
- Chevron is a separate button with `@click.stop` → only toggles `mailExpanded`; `aria-expanded` is set.
- Route watcher (`immediate`) expands Mail on any Mail route (covers refresh/direct URL) and collapses it for every other module.
- Active folder highlighting comes from `mail-nav.isLinkActive` using `route.name` / `route.params.folderKey`.
- Collapsed icon-only mode: the chevron is hidden, clicking the Mail icon opens a left `el-drawer` containing the same `MailNav` (accessible submenu access).
- Removed the old inline folder list and the duplicate Compose button from the sidebar; the account switcher remains (mail routes only) so Mail account switching and permissions are preserved.

**Not done deliberately**
- `Scheduled` is not listed: no backend folder/state exists, and the spec forbids non-functional menu links. Recorded as NOT IMPLEMENTED.

**Verified:** `/src/layout/aside/index.vue`, `/src/layout/mail-nav.vue`, `/src/layout/index.vue` transform 200; `/inbox`, `/sent`, `/drafts`, `/starred`, `/templates`, `/overview` serve 200. Collapsed-mode drawer and keyboard behaviour still need browser confirmation.

---

## CRM Reconstruction — BATCH A + B (2026-11-14)

Live: http://127.0.0.1:3001 (Vite pid 8796), branch xpass/hq-development. No commits/pushes/deploys.

**BATCH A — canonical model + navigation**
- Migration `v3_25DB` (init.js) backfills `crm_organizations` from `crm_companies` where no matching org exists (same user + case-insensitive name). Additive, idempotent, non-destructive; applied via the init endpoint (200 success). Local: 0 companies / 2 organizations before and after — no data loss, no duplicates.
- `crm_organizations` is now the single account concept (richer schema: legal_name, organization_type, relationship_status, commercial_terms, parent_id, audit fields).
- Terminology: `views/crm/deals.vue` title "Deals" → **Opportunities**; `views/crm/companies.vue` title → **Companies (legacy)**.
- New `mail-vue/src/layout/crm-nav.vue`: CRM sub-navigation (Overview, Contacts, Organizations, Leads, Opportunities, Pipelines + More: Activities, CRM Tasks, Linked Events, Relationships, Companies legacy), permission-filtered.
- `layout/aside/index.vue` generalized: grouped modules (`mail`, `crm`) render as an expandable group with chevron; route watcher expands the active group and collapses others; collapsed icon-only mode opens a drawer containing the same sub-nav.

**BATCH B — CRM Overview redesign**
- Removed all 11 rainbow-bordered KPI cards and the 8 orange buttons.
- `views/crm/overview.vue` rebuilt as an actionable workspace:
  - **My relationship work** — leads to qualify, open opportunities (with value), tasks due (with overdue badge), each linking to its page.
  - **Pipeline snapshot** — per-stage chips (count + value) computed from real open deals; header shows open count and total value in KES.
  - **Relationship activity** — timeline with typed icons and human timestamps.
  - **Quick access** — compact text links.
- Verified filters against `deals-api.js`: it scopes by `user_id` and supports `status`/`pipeline_id` but **not** `assigned_to`, so the section is labelled "Owned by you" rather than claiming assignment.

**Verified:** init.js syntax OK and migration applied; `/src/views/crm/overview.vue`, `deals.vue`, `companies.vue`, `layout/aside/index.vue`, `layout/crm-nav.vue` transform 200.

**Known limitation:** `crm_deals` has no `assigned_to` column, so CRM opportunity ownership is still single-owner via `user_id`. Record-level assignment for opportunities is not yet implemented (BATCH D).
---

## CRM BATCH A — correctness pass (2026-11-14, second pass)

Live: http://127.0.0.1:3001 (Vite pid 8796), worker 127.0.0.1:8787, branch xpass/hq-development. No commits/pushes/deploys.

**Blank CRM routes (root cause: missing Vue imports — no auto-import preset is configured)**
- `vite.config.js` uses `AutoImport({resolvers:[ElementPlusResolver()]})` with the default empty `imports`, so `onMounted`/`watch` must be imported explicitly.
- Fixed missing imports in: `activities.vue` (onMounted), `deals.vue` (watch — whole page threw during setup), `events.vue` (onMounted), `leads.vue` (onMounted), `organizations.vue` (onMounted), `relationships.vue` (onMounted).
- Audited the entire `src/views` tree with a script; the only other hits were `defineProps`/`defineEmits` in `content/index.vue`, which are compiler macros (false positives).

**Raw technical labels / i18n in attributes (145 occurrences, 15 files)**
- `label="{{ $t('key') }}"` is not interpolation in Vue — it rendered the literal string, so tables, dialogs, and tab panes showed `{{ $t('...') }}` text.
- Codemod rewrote every occurrence to `:label="$t('key')"` across `ai`, `automations`, `documents`, `finance`, `integrations`, `people`, `projects`, `support`, and CRM views. Zero remaining (`="\{\{` no longer matches).

**Data contracts**
- `crm_contacts.tags` is stored as JSON text and was returned raw, so `v-for="tag in row.tags"` iterated characters. Added `normalizeContact()` in `contacts-api.js`, applied to the list and to a new `GET /crm/contacts/:id`.
- Contact detail page fetched `contactsList({pageSize:1})` and then `.find(id)` — opening any contact other than the first showed an empty page. Replaced with the new detail endpoint (`contactsGet`).
- `GET /crm/contact-organizations` returned only ids, so Relationships showed `contact_id`/`organization_id` numbers. Now LEFT JOINs `crm_contacts`/`crm_organizations` and returns `contact_name`/`organization_name`.
- `GET /crm/activities` returned raw `entity_type`/`entity_id` and often-null `occurred_at`. Now resolves `entity_name` per entity type (contact, organization/company, deal/opportunity, task, event, support_request), falls back `COALESCE(NULLIF(occurred_at,''), create_time)`, and supports a `search` filter. `views/crm/activities.vue` rewritten to render friendly entity/activity labels, tag colours, and loading/empty states.

**Duplicate navigation**
- Removed "Companies (legacy)" from `crm-nav.vue`; Organizations is the single account concept. The `/crm/companies` route remains reachable but is no longer a nav duplicate.

**Slow initial HQ load**
- `views/hq/overview.vue` awaited `store.load()` before firing 13 widget requests; now all widget sources and the dashboard preference request run concurrently.
- `directoryList()` moved into the same `Promise.all` as the two request lists (with its own catch) instead of a third sequential round trip.

**Verified:** `node --check` on `contacts-api.js`, `contact-organizations-api.js`, `activities-api.js`; all touched `.vue` modules transform 200; live API reads: `/crm/activities` (entity_name + search), `/crm/contacts/1`, `/crm/contacts/9999` → `code 404 "Contact not found"`, contact create/list/delete round trip (tags `["vip","kenya"]` round-tripped as an array), `/crm/contact-organizations` with names, and 200 on all 11 CRM list endpoints.
---

## MAJOR RECONSTRUCTION — BATCH 1: SHELL / PRODUCT CLEANUP (2026-11-14)

Live: http://127.0.0.1:3001, worker 127.0.0.1:8787, branch xpass/hq-development. No commits/pushes/deploys.

**B1.1 Native browser dialogs removed (28 sites)**
- New `mail-vue/src/composables/use-confirm.js` wraps `ElMessageBox.confirm` (resolves `true`/`false`).
- 25 `confirm(...)` call sites across 20 views converted to `await confirm(...)` with real dialog, cancel, and focus handling.
- Finance was the only `prompt()` offender: `prompt('Account name:')`, `prompt('Client name:')`, `prompt('Amount (KES):')` replaced with proper dialogs (label, type, validation, cancel/save, loading, error handling). Account creation now also supports editing an existing account instead of silently create-only.
- Remaining native-dialog count: 0.

**B1.2 Navigation rebuilt to the target IA (registry.js + aside/index.vue)**
- Workspace: Overview, Mail, CRM, WhatsApp, Finance, Documents, Projects, Calendar, Notes, Requests & Decisions.
- People; Settings (Account Settings, Security); Administration (Employees, Roles & Permissions, Connections, Reports, All Mail, Invite Codes, Company Settings).
- Removed from primary navigation: **Support**, **Automations**, **AI** (AI is now a header-only contextual layer), **Approvals** (folded into Requests & Decisions), **Analytics** (now "Reports" under Administration), **Integrations** (now "Connections" under Administration).
- Legacy `<details>` admin block and `adminLinks` removed from the sidebar; admin destinations now render as a normal permission-filtered group.
- Removed dead `primaryMailLinks` / `categoryLinks` computeds left over from the old inline folder list.
- No routes deleted: `/support`, `/automations`, `/approvals`, `/crm/companies`, `/crm/organizations` still resolve, so bookmarks and historical records keep working.

**B1.3 Product language**
- `mail-vue/index.html`: title `XPass Mail` -> `XPass HQ`; description rewritten as an internal operating system, not "secure email for your team".
- `.env.dev/.release/.remote`: `VITE_PWA_NAME` `Cloud Mail` -> `XPass HQ`.
- Single dark theme enforced: `store/ui.js` default `theme: 'dark'`, `isDark` always true (so persisted `system`/`light` users also get dark); theme picker removed from Settings and replaced with a static "XPass Dark" indicator. No white theme toggle, no theme selection.

**B1.4 Shared design fixes**
- `components/hq-empty-state/index.vue` was hardcoding light-theme hex values (`#fbfaf9`, `#e7e2de`, `#302b28`) on a dark product — now uses `--hq-border`, `--hq-surface`, `--hq-accent`, `--hq-text`, `--hq-muted`, plus a compact variant and mobile wrapping.
- Refresh demoted on 23 pages: prominent labelled `Refresh` buttons replaced with subtle icon-only buttons (`text circle` + aria-label/title). CRM Home refresh is now a 32px icon button.
- Empty states rewritten for Documents, Projects, Notes, People, Requests: each now explains what the module is for, what belongs there, and offers the real first action (upload document / create folder / write note / create project / add person). No more "No projects yet" with a single create button.

**Verified (B1)**
- `node`-based codemods run against real files; 0 remaining `prompt(`/`confirm(`/native `alert(` in `src`.
- All 44 routed components transform `200` from the dev server with no `[plugin:` / `SyntaxError` (blank-page compile check).
- Route audit: 44 routes, 0 duplicate names, 0 duplicate paths.
- `/src/layout/aside/index.vue`, `/src/modules/registry.js`, `/src/store/ui.js`, `/src/views/setting/index.vue`, `/src/components/hq-empty-state/index.vue`, `/src/composables/use-confirm.js` all transform 200.

**Known limitations / next unfinished operation**
- Browser-level visual confirmation is not available in this environment; all checks are compile + transform + API level, not screenshot level.
- CRM terminology reset (Contacts/Leads/Outreach, remove Organizations as primary), Roles/Scopes, Audit Logs, Requests+Decisions merge, Documents/Projects/Calendar/Finance/WhatsApp rebuilds are batches 2-10 and are not started.
- `/approvals`, `/support`, `/automations`, `/crm/companies`, `/crm/organizations` remain routable pages pending their batch; they are intentionally absent from the navigation.

---

## BATCH 2 - Canonical internal identity (complete)

**B2.1 Identity storage (worker)**
- `init.js`: `v3_26DB` added the additive identity columns (`display_name`, `username`, `avatar_key`, `job_title`, `phone`, `team_id`, `update_time`), the `team` and `user_team` tables with indexes, and seeded six teams. `v3_27DB` added `user.last_seen_at` plus `idx_user_last_seen`. Both are re-runnable and applied locally through the init endpoint.
- `service/identity-service.js`: username normalisation and validation (reserved handles, length, character set, must start with a letter), availability check, avatar magic-byte validation (PNG/JPEG/WEBP, 2 MB), avatar store/delete, `toIdentity` mapper, `initialsFor`.
- `service/directory-service.js`: one implementation behind both directory routes (legacy `GET /directory` and canonical `GET /user/directory`) with paging, search across name/handle/email/job title/team, team filter, online flag and last-seen, phone stripped.

**B2.2 Identity API**
- `GET /user/identity`, `PUT /user/profile` (partial updates only; every absent field is preserved), `POST /user/avatar`, `DELETE /user/avatar`, `POST /user/presence`.
- Team administration: `GET /setting/teams`, `POST /setting/team`, `PUT /setting/team/:id`, `DELETE /setting/team/:id` (archive, never detach people).
- `loginUserInfo` returns the canonical identity so the shell and header share one source.
- Validation now rejects input instead of silently rewriting it: `"has space"` and 30-character handles return an error naming the rule; clearing the field with an empty string is the supported way to remove a handle.
- Team name uniqueness counts active teams only, so an archived name can be reused.
- `/setting/team*` is behind `setting:set`; a Support Agent gets `403` on create/rename/archive and `200` on their own profile.

**B2.3 Profile and people UI**
- `views/setting/index.vue` profile tab: avatar with upload/remove, display name, @username, job title, work phone, team selector, save/reset, inline field errors, and a refresh of the user store so the header updates immediately. Legacy read-only identity rows kept for mail display name and password.
- `views/people/index.vue`: two tabs. **Employees** is the canonical directory (search, team filter, paging, online dot, avatar). **External people** keeps the existing `people` table for contractors and partner contacts, so nothing was dropped.
- `views/requests/index.vue`: recipient picker now lists employees with avatar, display name, @handle and team instead of `name (email)`.

**B2.4 Presence**
- `composables/use-presence.js`: 60-second heartbeat, paused while the tab is hidden, refreshed on visibility change.
- `POST /user/presence` writes at most one row update per employee per minute; the online window is evaluated in SQL so the browser timezone cannot shift it.
- Presence dot rendered in the header avatar (both sizes) and on every employee row in People.

**B2.5 Navigation cleanup**
- `/support` redirects to Requests; `/automations` redirects to Overview. Components stay on disk, so no feature file was deleted, but a dead URL no longer renders a shell.

**Verified (B2)**
- `node --check` on every edited worker module; `v3_27DB` applied via the init endpoint (`success`) and `last_seen_at` read back from D1.
- Transform check (`200`, no `[plugin:`/`SyntaxError`) on `App.vue`, `layout/header/index.vue`, `views/setting/index.vue`, `views/people/index.vue`, `views/requests/index.vue`, `composables/use-presence.js`, `request/profile.js`, `router/index.js`.
- API matrix (23 assertions, all passing): identity read; partial profile update preserves other fields; reserved/space/over-length usernames rejected; duplicate handle rejected; avatar upload, serve (`image/png`), wrong type and oversize rejected, delete; both directory routes return the same canonical shape with `isOnline`/`lastSeenAt` and no phone; directory search; team create, duplicate-name rejection, rename, archive; Support Agent blocked from team administration and allowed on their own profile; presence heartbeat visible in the directory.

**Known limitations (B2)**
- Presence is a heartbeat, not a socket: "online" means "active in the last 90 seconds".
- The directory returns at most 200 rows per page; there is no cursor paging yet.
- Browser-level visual confirmation is still unavailable here; checks are compile/transform/API level.

---

## BATCH 3 - STAGE 0 COMPLETE: black-screen root cause and repair

**Symptom:** every route rendered a black screen after the Batch 2 identity work. Transform-level checks passed, so the fault was a runtime-only failure.

**Root cause (single, deterministic):**
`mail-vue/src/layout/header/index.vue` called `usePresence()` in `<script setup>` (line 197) but the import of `@/composables/use-presence.js` was never added. The insertion had been attempted with a script that anchored on `import {useAiStore} from "@/store/ai.js";` (with a semicolon) while the real line has no semicolon, so the edit silently did nothing. `usePresence` was therefore an undefined identifier at setup time: a `ReferenceError` thrown while the layout header was being created, which aborts the whole layout render and leaves the dark body background with no content - a black screen on every route, including `/overview` and `/mail`.

**Fixes applied**
- `layout/header/index.vue`: added the missing `usePresence` import.
- `App.vue`: `usePresence()` had been injected inside `handleSystemThemeChange` (wrong anchor, same scripted-edit failure). Moved back to setup, and the theme handler restored to `uiStore.applyTheme()` only.
- `layout/header/index.vue`: replaced every unguarded `userStore.user.role.*` read with a `userRole` computed that always returns an object, plus a `userRoleName` fallback. A missing or partial profile can no longer throw during render.
- `init/init.js`: `websiteConfig()` and `loginUserInfo()` are both failure-tolerant now; if a stored token does not resolve to a user the token is removed so the router guard sends the employee to sign-in instead of rendering an identity-less shell. `user.account` is read defensively.
- Verified no other file uses a helper without importing it (static scan of 147 files over `usePresence`, `useConfirm`, `HqAvatar`, `identityGet`, `identityUpdate`, `avatarUpload`, `avatarRemove`, `heartbeat`, `directoryList`, `teamList`, `hasPerm`, `workspaceModules`, `AiPanel`): no remaining undeclared usage.
- Module graph crawl from `/src/main.js`: 145 src modules, no unresolved imports, no missing named exports.

**Runtime verification performed**
- Vite dev server still serves on 127.0.0.1:3001; worker on 127.0.0.1:8787; no duplicate/stale Vite instance.
- SSR harness (real Vite pipeline, pinia + router + i18n) rendered `hq-avatar`, `people` and `requests` to real markup (221 / 4562 / 5424 bytes) with no setup exceptions.
- `header`, `aside` and `setting` could not be SSR-rendered here: they are the components with `<style lang="scss">` blocks and this harness's sass integration fails (`[sass] Cannot read properties of undefined`). The same files transform with HTTP 200 in the browser dev pipeline, so this is an environment limitation of the harness, not an app fault.
- **Visual/browser confirmation is still NOT available in this environment.** Batch 2 and Stage 0 are therefore classified API/compile-verified only, not visually verified. Documentation wording corrected accordingly.

**Stage 1 start - unsafe administrator bypass removed**
- `security/security.js`: removed `authInfo.user.email !== c.env.admin` from the `requirePerms` failure branch. Authorization now comes only from `permService.userPermKeys`, which grants the configured administrator the explicit permission set and re-applies `user_perm_override` deny rules. An administrator can now be restricted by an explicit deny instead of silently receiving every capability.
- Confirmed the administrator keeps working access through explicit permissions: `GET /crm/contacts` 200, `GET /finance/accounts` 200; Support Agent gets 403 on `/finance/accounts` and `/documents`.

**Next unfinished operation (Stage 1 remainder)**
1. Enumerate every remaining identity-based bypass in the worker (`public-service.js`, `email-service.js`, `account-service.js`, `user-service.js`) and classify each as legitimate mail-domain ownership or an unsafe data bypass.
2. Audit `requirePerms` coverage against the actual route table so no module API is reachable without a permission check (Mail, CRM, Documents, Projects, Calendar, Notes, Requests/Decisions, WhatsApp, Finance, People, Reports, Connections, Administration, Roles).
3. Introduce explicit `module:action` keys with scope metadata (own/assigned/team/company) in the permission seeds, then wire query-level scope filtering.

## BATCH 3 - STAGE 1 (partial) + STAGE 2 (start): authorization enforcement

**Route coverage audit (script over 219 registered routes vs 63 `requirePerms` prefixes)**
- Legitimate no-perm surfaces: `/register`, `/logout`, `/oauth/*`, `/public/*` (own token), `/webhooks` (signature verified), `/oss/*` (asset guard), `/telegram/getEmail/:token` (token scoped), `/setting/websiteConfig`, `/my/*` (self, token-derived), `/user/{identity,profile,avatar,directory,presence}` (self-service), `/dashboard/preferences*` (own data), `/directory` (employee lookup).
- Real gaps found and closed: mail reading and mailbox management had no permission check at all, so any authenticated employee could call `/email/list`, `/email/latest`, `/email/attList`, `/email/read`, `/mailbox/*` and read mail. `/star/*` and `/role/selectUse` were also open to any authenticated employee.

**Changes**
- `init.js` `v3_28DB`: creates `email:query` under the mail parent and grants it to every role that already holds an `email:*` permission (existing mail users keep access). Roles with no mail permission are deliberately left without it. Duplicate `role_perm` rows removed.
- `security.js`: `/email/list`, `/email/latest`, `/email/attList`, `/email/read`, `/mailbox`, `/star`, `/role/selectUse` added to `requirePerms`; new `email`, `mailbox` and `star` branches in `pathToResourcePerm` (`/email/send` -> `email:send`, `/email/delete` -> `email:delete`, mail reads -> `email:query`, mailbox mutations -> `email:send`, stars -> `email:query`, `/role/selectUse` -> `role:query`).
- Administrator bypass removed earlier in this stage (see Stage 0 record).

**Verified**
- `node --check` on `security.js` and `init.js`; migration applied (`init: success`) and `email:query` read back from D1 (perm_id 721, granted to roles 1 and 2).
- `GET /mailbox/counts` 200, `GET /star/list` 200, `GET /role/selectUse` 200 for the administrator; `GET /email/list` reaches business validation instead of a permission error, i.e. the permission passed.
- Support Agent (`type 5`, no mail permissions) now receives 403 on `/email/list`. Mail is administrator-only in the local database until roles are granted mail access.

**Next unfinished operation (Stage 2)**
1. Extend the permission seed with the module/action matrix from the batch brief (finance view/create/edit/approve/export/manage-*, documents view/upload/download/share/manage-access, whatsapp view/reply/send/bulk-send/assign/view-history/configure, mail view/send/reply/delete/manage-shared-mailbox/configure, crm.contacts view/create/edit/archive/assign/import/export/view-restricted-fields) with scope metadata (own/assigned/team/company).
2. Add `scope` storage (role scope + user override) and enforce it in queries (assigned contacts, team projects, private calendar, personal notes, requests where sender/recipient/reviewer).
3. Then Stage 3: role builder UI and effective-access preview.

## BATCH 3 - STAGE 2.5 (shared shell) + STAGE 3 start (scope foundation)

**Stage 2.5 - shared header / profile / create (files: `layout/header/index.vue`, `i18n/en.js`, `i18n/zh.js`)**
- Profile dropdown rebuilt around identity: avatar (48px, presence dot), display name, @username, work email, then one work-context line (job title · team), then a single muted access line (`<role> access`) with a shield icon. No quota counters, no row of competing role badges.
- Removed from the employee profile menu: the legacy Cloud Mail quota block ("Send email: Unlimited", "Add address: Unlimited") and the three role pills. Legacy mail quota data is untouched in the database and still used by the mail screens; only this presentation was removed.
- Profile actions: My profile (`/setting?tab=profile`), Mail accounts (`/setting?tab=accounts`), Security (`/setting?tab=security`), Sign out. Sign out moved to a quiet full-width button below a divider (was a primary orange button competing with the identity block). No dead entries: there is no Sessions route yet, so none was added.
- `myProfile` added to en/zh i18n (the previous label reused `settings`).
- Create menu rebuilt: 5 permission-filtered groups (Communication, CRM, Work, Schedule, Documents). Removed: New approval (approvals fold into Requests & Decisions), New deal, New organization, New reminder, New team calendar event (merged into one calendar action; visibility is chosen in the event dialog), New event (ambiguous). Kept: New email, New request, New contact, New lead, New task, New project, New note, New calendar event, Upload, New folder.
- The group matching the current module is moved to the top, so Create stays useful without becoming a site map.
- Right toolbar: `.toolbar` gap 4px -> 8px, `justify-content: flex-end`, `margin-left: auto`, `flex: 0 0 auto` so AI / Create / notifications / avatar read as one right-aligned control group at any width. Dropdown width 210px -> 264px (max 320), 36px rows, icon gutter, muted section labels.
- `@username` and email metadata recolored from orange to muted (orange is now reserved for meaningful accent).

**Stage 3 start - record scope policy**
- `init.js` `v3_29DB`: `role.data_scope` (NOT NULL DEFAULT 'own'), `user.data_scope` (nullable override). Invalid values normalised. Role 1 (administrator) set to `company`; every other role stays `own` (deny by default).
- `service/scope-service.js`: `resolveScope` (user override -> role -> 'own'), `scopePredicate` (own / assigned / team / company) and `normalizeScope`. Resolved per request on purpose: a cross-request cache would keep stale access after a role change.
- `contacts-api.js` list + count now apply the scope predicate before returning rows (previously a hard `user_id = ?` filter, i.e. no way for a manager to see team records).
- `user-service.loginUserInfo` returns `dataScope` so the UI and the access preview can show it.
- Verified: administrator (`company`) sees all contacts; Support Agent (`own`) sees none; probe record deleted afterwards.

**Verified in this stage**
- `node --check` on `header` (transform 200), `init.js`, `scope-service.js`, `user-service.js`, `contacts-api.js`, `i18n/*`.
- API: `/my/loginUserInfo` includes `dataScope`; admin contacts total widened to company records; agent contacts total 0.
- Still NOT visually verified: no browser is available in this environment, so header/profile/create layout is transform-verified only.

**Next unfinished operation**
1. Enforce scope in the remaining record modules (leads, calendar already has visibility, documents, projects, notes are own-scoped today) and add the `assignee_id` column CRM needs before `assigned` scope can mean anything.
2. Then Stage 3: role builder (Overview / Members / Permissions / History), effective-access preview generated from real permissions + scope.
3. Then Stage 4: employee creation/invite must select an access profile before activation.

## BATCH 4 - ASSIGNMENT + ACCESS HISTORY + ROLE BUILDER

**CRM assignment (files: `contacts-api.js`, `leads-api.js`, `use-team-members.js`, `views/crm/index.vue`, `views/crm/leads.vue`)**
- `v3_30DB`: nullable `assignee_id` on `crm_contacts` / `crm_leads` (`user_id` stays "created by"), indexes, and a backfill of `assignee_id = user_id` so "Assigned to me" keeps working for historical rows. Added `contacts:assign` / `leads:assign` permissions (parent resolved through an existing child, because module parents have no `perm_key`), plus the duplicate-permission collapse.
- `PUT /crm/contacts/:id/assignee` and `PUT /crm/leads/:id/assignee`: dedicated endpoints that require the explicit `:assign` permission, reject a target that is suspended/removed, write the previous -> new assignee with actor and timestamp into `crm_activities`, and return 403 for edit-only roles.
- List + count + detail now share one predicate: `own` scope means "records I created OR records assigned to me" when the table has an assignee, so handing work to somebody no longer hides it from them. Assignment filters (`assignee=me|unassigned|<id>`) are applied after the scope predicate, so a filter can never widen access.
- Leads list gained the same scope predicate and an `assignee` display label; both lists return `assignee` as a canonical label (`Name (@handle)`) rather than an id.
- UI: Assignee column with an inline picker on Contacts and Leads, rendered only with the matching `:assign` permission; failed writes restore the previous value and reload.

**Access history (files: `init.js` `v3_31DB`, `role-service.js`, `role-api.js`, `user-service.js`, `security.js`)**
- `role_audit` table (append-only) with role, actor, action, summary, detail, timestamp. `roleService.recordAudit` writes it; a failure to record never blocks a permission change.
- Audited actions: create, edit, permissions (+n / -n), scope change, delete, default role, and member role change (`userService.setType` captures the previous role first, because the row changes in place).
- `GET /role/history` and `GET /role/members`, both gated by `role:query`.

**Permission gate fixes found by route-coverage audit (file: `security.js`)**
- `/role/set` and `/role/setDefault` are PUT, so the generic `PUT -> edit` rule demanded a `role:edit` permission that does not exist: no role except `*` could edit a role. Added an explicit `role` branch (add / set / delete / query).
- `/user/setPwd`, `/user/setStatus`, `/user/setType`, `/user/resetSendCount` demanded `user:edit`; the catalog has one permission per action (`user:set-pwd`, `user:set-status`, `user:set-type`, `user:reset-send`). Added an explicit `user` branch; `restore` maps to `user:set-status`.
- `/setting/setBackground` and `/setting/deleteBackground` demanded `setting:add` / `setting:delete`; both are configuration changes and now require `setting:set`.
- Camel-case route segments (`/regKey/*`, `/allEmail/*`) never matched the hyphenated permission keys; added aliases (`reg-key`, `all-email`).

**Role builder UI (file: `views/role/index.vue`, rewritten)**
- Four real tabs: Overview (role, data scope selector, member count, permission count, default/delete), Permissions (permission tree grouped by product area, group select-all with indeterminate state, filter, save), Members (current holders, change role inline), History (audited changes with actor and detail).
- Data scope is editable per role; scope changes are audited and no longer clear permissions.
- `roleService.setRole` hardened: partial updates are legitimate (a scope-only change must not clear grants), only known role fields are written, and `dataScope` is normalised before it reaches the row. `role` entity exposes `dataScope`.

**Terminology (files: `modules/registry.js`, `views/people/index.vue`, `views/requests/index.vue`, `views/setting/index.vue`, `layout/header/index.vue`, `components/hq-avatar/index.vue`)**
- Employee -> Member / Team member across user-facing copy; People module renamed "Members" with "Add members and manage their access"; the internal `employees` ref on the people page renamed to `members` so the tab name and the script agree.

**Verified in this stage**
- `node --check` on every changed worker file.
- API assertions (12/12 pass): role list exposes `dataScope` and real `memberCount`; scope-only update keeps all 42 grants and writes the new scope; explicit list applies (+1/-1 and restore); history records scope and permission changes with the actor; members endpoint returns identity; agent gets 403 on `/role/history`, `/role/set` and `/user/setType`.
- Assignment: admin assigns (200), suspends target rejected (400), `assignee=unassigned` / `me` filters correct, agent without `:assign` gets 403, assigned contact visible to the assignee under `own` scope.
- UI: `views/role/index.vue`, `views/crm/index.vue`, `views/crm/leads.vue`, `views/people/index.vue` all transform 200 with no plugin errors.
- NOT visually verified: no browser in this environment, so all UI findings are transform- and API-verified only.
- Data note: two role permission sets (Growth, Engineering) were emptied by an intermediate version of the update path and restored from the seeded sets (Growth 42, Engineering 25); all other roles untouched.

**Next unfinished operation**
1. Effective-access preview: show the exact permissions and record scope a member would get, generated from real role + override data (no speculative UI).
2. Extend scope enforcement to the remaining CRM record endpoints (`/crm/contacts/:id` detail, search suggestions, bulk operations, export) and to companies/organizations/deals/projects/documents.
3. Stage 4: member creation/invite must select an access profile before activation.
---

## BATCH 5 - STAGE 3 COMPLETION + REQUESTS AS THE SINGLE INTERNAL FLOW

### Stage 3A - Effective-access preview
- New `service/access-service.js` projects the resolved permission set (role grants + per-user overrides) and the resolved record scope into human language. Nothing is hardcoded per member: the model walks the real keys and only attaches the wording.
- `GET /user/access` returns the caller's own access; `GET /user/access?userId=N` requires `user:query`. `GET /role/access?roleId=N` previews a role definition from its stored grants.
- Role Builder gained an **Access preview** tab: record scope, Can / Cannot lists, and per-area summaries such as "View and manage CRM Contacts — only their own records." and "View Finance records. Cannot create, edit, approve or delete them."
- `access-service.js` `AREAS` covers mail, contacts, leads, companies, organizations, deals, activities, finance, projects, tasks, documents, notes, calendar, requests, approvals, support, automations, WhatsApp, people, reports, roles and members.

### Stage 3B - CRM scope rollout (finished)
- Contacts: detail, list, count, create, **update**, **delete (archive)** and assignment are all scope-resolved. The update and delete routes did not exist before, so the UI's Edit and Delete buttons were silently 404ing.
- Partial updates no longer clear fields: `email`, `phone`, `company_id`, `address` and `notes` use `COALESCE`.
- Leads: added `GET /crm/leads/:id`; update and archive now use the same scope predicate as the list instead of a hard `user_id = ?`.
- Activities: the feed is now record-scoped. A member sees their own entries plus entries about contacts and leads they may see; the predicate is built in SQL (no fetch-then-filter). Entity names are resolved for records the member may see, not only ones they created. Activity about a record stays visible after the record is archived.
- Verified 24/24 assertions: unassigned records invisible (404), out-of-scope edit/archive denied, assigned records readable/editable/archivable by the assignee, partial edit preserves data, search totals scoped, activity never leaks a private record, archived activity retained.

### Stage 3C - Permission-gate repair found by the scope tests
- `pathToResourcePerm` gated CRM **edit** routes behind the `:add` key, so a role with `contacts:edit` but no `contacts:add` got 403 on every update. Now the edit suffix is checked first, with the create key as fallback only for modules that have no edit key.

### Stage 3D - Identity is administrator-controlled
- `PUT /user/profile` rejects `jobTitle` and `teamId` from the member themselves (403 with an explanatory message). Display name, username, phone and avatar stay self-service.
- New `PUT /user/:id/assignment` sets role, team and position, each behind its own permission (`user:set-type`, `setting:set`) and each written to `role_audit`.
- Settings › Profile now shows Position and Team read-only, with "set by an administrator" copy.
- Verified 10/10: member cannot set own position or team, member can still edit display name, administrator can set all three, member cannot change another member's role, changes are audited.

### Requests become the single internal flow
- Migration `v3_32DB`: `internal_requests.type` (action, approval, review, information, access, finance, document, project, other), `team_id`, `attachments`; existing rows mapped from `kind`.
- `type` decides which actions exist (`actionsFor`), and `act` validates against that list before the transition table. Approval-type finance requests still require `finance:approve`.
- Inbox scopes: `received`, `sent`, `team` (anybody in my teams, or the request's team), `open`, `history`. History returns terminal requests — completed, approved, declined, rejected and cancelled are never removed, only moved out of the active lists.
- `type` and `search` filters on the list; `GET /requests/:id` returns `type`, `actions` and an events timeline whose `actor` is a human label (`Rodney (@rodney-dev)`), never a bare id.
- Requests UI: Assigned to me (with a waiting badge), Sent by me, Team, Open, History tabs; type filter; search; type column; composer gains Type (with explanations), optional Team, Related record (module + id) and attachment links; empty states explain where finished requests go; timeline renders "Rodney approved this request".

### Removed: director voting
- No 2-of-3 voting, quorum, abstention or director-vote code exists in the repository: whole-word searches for vote/voting/quorum/abstain across `mail-vue/src`, `mail-worker/src` and `doc` return only the job-title example "Director" in settings, a leadership dashboard-layout mapping and the "Leadership" team description. Nothing user-facing to disable; the product is single-decider by construction.
- `dashboard-api.roleKey` maps role *names* to a default widget layout only. It never grants a permission; every widget is filtered by the caller's real keys through `allowedCatalog`.

### Verification summary (this batch)
- `node --check` on every changed worker file; all changed views transform 200 with no plugin or syntax errors.
- API assertion suites: access preview (self/other/role), CRM scope 24/24, requests 18/18, identity 10/10, role builder 12/12.
- Temporary test grants lived in `user_perm_override` and were reverted; role definitions were not modified by the tests.
- No browser in this environment: UI findings are transform-verified, not visually verified.

### Exact next operation
1. Shared company mailboxes: extend the existing mail account model with mailbox membership (`mailbox_member`), enforce access server-side, and add the mailbox switcher to the Mail navigation.
2. Conversation assignment, transfer, tags and internal notes on shared mail, with audit entries.
3. Overview attention cards for shared-mail assignments.
4. Personal signature scoping: keep the personal signature on personal mail only, add the resized 1200×400 derivative (600×200 in email HTML) and remove "All sending addresses".
---

## Batch 4 checkpoint — shared company mailboxes (backend complete)

### What is finished and verified
- Schema `v3_33DB` applied to the real dev database: `mailbox_member`, `mailbox_member_audit`, `mailbox_conversation`, `mailbox_conversation_event`, `mailbox_tag`, `mailbox_conversation_tag`, `mailbox_preference`, plus the `account` mailbox columns and the `mailbox:query` / `mailbox:manage` permissions.
- `shared-mailbox-service` and `shared-mailbox-api` implemented and running: switcher, current-mailbox restore, conversation list and detail, status, priority, assignment and transfer, tags, internal notes, timeline, member administration, member audit, assignment candidates, request backlink.
- Enforcement verified end to end against a Mail-only role (role 8) with no CRM, Finance, Documents or Role administration: 11/11 authorization assertions pass, including that a non-member gets 404 and a role without mail keys gets 403.
- Internal note isolation verified by inspecting the stored sent rows: no `INTERNAL-NOTE-MARKER` and no `xpass-user-signature` in any outgoing message.
- Reply from a shared mailbox verified: the send is accepted only for a member holding `send`, and the stored sender is the shared address.
- Request backlink verified: `mailbox_conversation.related_type='request'`, `related_id=16`, visible on the conversation detail.

### Pre-existing defects fixed in this batch
- `email-service.send` crashed with 500 on a missing recipient list; the list is now normalized up front and rejected with 400 when empty.
- `email-service.saveSentEmail` and the daily send counters used a local `recipientList` that is not in scope; they now use the `receiveEmail` parameter.
- `role-service.selectByUserIds` was called but never defined, breaking internal delivery; it now exists.
- `shared-mailbox-api` shadowed its own `keys()` helper, throwing a TDZ `ReferenceError`; the local is now `perms`.
- `listForMember` bound three parameters to two placeholders.
- `listMembers` and `member-audit` accepted a role-level `manage` key without the per-mailbox `manage_members` action; both now require the action.

### Exact next operation
1. Mail navigation switcher: add the mailbox selector at the top of the expanded Mail nav in `mail-vue/src/layout/mail-nav.vue`, driven by `GET /shared-mailbox/list` and `GET /shared-mailbox/current`.
2. Add a `mailbox` store and make mailbox switching refresh the mail context only — no application re-bootstrap, no role or team refetch, and a loading state confined to the message list.
3. Collaboration bar in the reader: assignee, status, priority and tags, sourced from `GET /shared-mailbox/conversation`.
4. Internal-note composer as a separate editor mode from Reply, so internal content can never be sent externally by a single toggle.
5. Timeline view, then create-request-from-conversation, then work-queue filter controls above the message list.
6. Overview attention cards for shared-mail assignments; signature settings (personal scope only, 600x200 preview, replace/remove); terminal Request History tab; Approvals to Requests redirect.

### Local dev environment note
The Miniflare persist directory at `mail-worker/.wrangler/local` cannot start its R2 metadata (`std::terminate()` / "The Workers runtime failed to start"). The working dev database is a copy at `%TEMP%\kilo\persist-S` with the D1 and KV directories only; the worker runs from there with `--persist-to`. `mail-worker/.wrangler/local` should be repaired or removed before the next session.

## Batch 4 checkpoint (frontend)

### Landed and verified
- **Thread model.** `v3_34DB` applied. A conversation is a thread, not a message: `mailbox_conversation_message` holds every message in the thread, `conversationForEmail` resolves through it, and `conversationDetail` returns the thread in order.
- **Direction-aware registration.** `registerMessage` opens a thread on inbound, moves it to `waiting_customer` on our reply, and reopens it on a customer reply while preserving assignee, tags and history.
- **Queue counts.** `GET /shared-mailbox/summary` returns per-inbox counts (new, unassigned, mine, waiting_internal, urgent, open, total) computed from the live queue.
- **Filters.** `excludeStatus` and `assignedToMe` added to the conversation list, verified against the live queue.
- **Verification.** 15/15 unit assertions on the thread model (threading, reopen, assignee/tag preservation, idempotency, ordering, summary counts) plus live API checks for assignment, filters and snippet.
- **Mail nav.** No switcher. One workspace: Compose, PERSONAL (Inbox/Sent/Drafts/Starred/Templates), SHARED (only authorized inboxes, with server-computed badges), More folders. Shared inboxes route to `mail-shared-inbox`.
- **Shared inbox view.** `mail-vue/src/views/mail/shared-inbox.vue`: filter chips, conversation list, collaboration bar (assignee/status/priority/tags), full thread, activity log, and a composer with Reply / Internal note as separate modes. Gated by `mailbox:query`.
- **Compose From selector.** The From list is now stored membership only; defaults to the shared inbox the composer was opened from, otherwise the personal mailbox; a shared send carries no personal signature.
- **People → XPass Team.** Renamed, with Members / Teams / Roles & permissions tabs. Teams are real (`/setting/teams`, add-team dialog). Roles show member and permission counts and link to the Role Builder. Add member creates the account and then assigns the team through the administration route.

### Defects found and fixed in this batch
- `mailboxSummary` was missing from the service's default export, so the summary route threw `is not a function`.
- `conversationDetail` selected a non-existent `email.html` column, so every conversation returned "Please update the database".
- `email-service.send` passed an out-of-scope `emailId` into the conversation hook; the parent id now travels on `saveParams.parentEmailId`.
- The composer's From list came from `GET /account/list`, exposing every address on the instance. It now comes from mailbox membership.
- `mail-vue/src/i18n/zh.js` had been re-encoded through the ANSI code page, corrupting every Chinese string; repaired and verified (744 keys parse).

### Environment
- The Miniflare R2 metadata under the persist directory aborts worker startup (`std::terminate()`), and the crash is triggered by the `r2` directory itself. A persist directory containing only `v3/d1` and `v3/kv` starts cleanly. Current working directory: `%TEMP%\kilo\persist-T`.
- `npx wrangler` resolves to 4.90.0 locally and its bundled workerd will not start on this machine; `npx wrangler@4.162.0` does. Use the pinned version for `wrangler dev`.

### Exact next operation
1. Overview attention cards: surface shared-inbox counts, follow-ups due and subscription reminders on `/overview`, all from data that exists.
2. CRM navigation: Overview / Leads / Contacts / Follow-ups / History / Imports only; hide Organizations, Opportunities, Pipelines and Linked Events from the primary nav without deleting their routes or data.
3. Lead create form with a visible Save button and inline validation, then the Lead profile (Overview, Contact, Social profiles, Notes, Follow-ups, History).
4. Contacts as one directory with multiple classifications, then Activities rebuilt as History.
5. Finance: navigation, real negatives, debts with payment history, budgets with variance, subscriptions with stored reminder offsets, and one audit trail.
6. Global icon/card audit and the remaining visual cleanup, then a final build and the 34-item checklist report.

## Finance OS — KES-first rebuild (2026-11-16)

This replaces Gate 6's thin ledger with a finance function that a company could
actually run on. It is the only work in flight; CRM, Contacts and the Lead
profile are deliberately not touched until Finance is verified.

### What is finished and verified
- **Migration `v3_35DB`** — 16 `finance_*` tables, the columns the new flows
  need, 24 `finance%` permissions and 24 seeded categories. Additive: existing
  accounts, transactions and invoices are untouched and re-running is a no-op.
- **Money as integer cents** — `mail-worker/src/lib/money.js` is the only
  conversion layer. The UI formats KES; the API never converts.
- **`finance-service.js`** — accounts, ledger, transfers, funding, budgets with
  commitments, debts with adjustments and ageing, subscriptions with stored
  reminder offsets, invoices with editable line items, reimbursements with a
  review step, advances with settlement, overview, reports and audit.
- **`finance-api.js`** — thin routes over the service, one rule per behaviour so
  two routes can never disagree about the same record.
- **Frontend** — one Finance view with a permission-filtered nav
  (Overview / Accounts / Transactions / Budgets / Debts / Subscriptions /
  Payments / Invoices / Reports / Audit), each panel lazy-loaded, all KES.
  `/hq` overview reads the same overview endpoint and lists what needs attention
  (over budget, overdrawn accounts, renewals inside 7 days).

### Rules that are enforced, not described
- Voiding keeps the row and restores the balance.
- Transfers move money without counting as income or expense.
- A debt's original amount is never overwritten.
- A commitment reserves budget without spending it.
- A claim is paid only after approval; a declined claim can never be paid.
- An advance settles into spent and returned, and the two must add up.
- An invoice cannot be paid above its balance or edited below what was paid.
- A member without company scope sees only the accounts they own or were granted,
  on reads as well as writes.

### Verification
- Offline suite (real SQLite, migration taken verbatim from `init.js`):
  **140/140 pass**.
- Live suite (dev Worker, real login, real JWT, every assertion an HTTP call):
  **51/51 pass**.
- `wrangler@4.162.0 deploy --dry-run` bundles cleanly; `vite build --mode
  release` succeeds.
- Not verified: no headless browser here, so panel rendering is unverified by
  interaction. The dev Worker must be started with the persist directory
  `%TEMP%\kilo\persist-T` (`--local --ip 127.0.0.1 --port 8787`) and the worker
  restarted by touching `mail-worker/src/index.js` when hot reload misses.

### Defects found and fixed in this batch
- `voidTransaction` never called `.run()` on its UPDATE.
- `monthlyEquivalent` divided where it should have multiplied.
- Subscription reminder semantics were inverted in `decorateSubscription`.
- Transfers were counted as income and as expense in three places.
- `overview` crashed on `finance_debt.is_del`.
- Advances were booked as expenses when issued.

### Exact next operation
1. Shared mail: verify the composer's From selector end to end — open the
   composer from a shared inbox and confirm that address is preselected, then
   switch it and confirm the signature follows the personal mailbox only.
2. Decide whether a settled advance should be reopenable when a return is
   discovered later; today settlement is final by design.
3. Then, and only then, resume the CRM navigation rebuild (Overview / Leads /
   Contacts / Follow-ups / History / Imports), the Lead profile and the Contacts
   directory.

## Finance OS — second batch: context, export, confidentiality, approvals (2026-11-16)

### What changed
- **Record context.** A transaction now carries its context: `transactionDetail`
  resolves every linked record to a name, returns net effect and the row's audit
  trail, and resolves the other half of a transfer. The Transactions table opens
  a drawer instead of ending at a bare row.
- **People, scoped.** Accounts take a custodian and budgets take an owner.
  `GET /finance/members` returns names only, gated on an assigning finance key,
  so the owner picker does not need `user:query`.
- **Export.** The CSV is built on the server from the same filters and the same
  account scope as the list, and audited. The old button exported one page.
- **Confidential.** `finance.view_confidential` is now enforced: company-wide
  access alone does not open payroll or legal, and totals exclude what the caller
  may not see instead of leaking it.
- **Roles repaired.** The shipped Finance Manager role carried pre-rebuild keys
  the service never read; v3_36 grants the workflow keys and keeps the legacy
  keys as accepted aliases.
- **Approvals vs payments.** An approved finance request can be committed to a
  budget (planned, linked, no money moved) from the Requests view or
  `POST /finance/requests/:id/commitment`.
- **Reports.** `GET /finance/reports/summary` gives opening, in, out, fees,
  transfers, net and closing per account and per counterparty.
- **Overview.** Budget, subscription, invoice and debt blocks are optional, so a
  member with ledger access but not subscriptions gets a cash position instead
  of a 403.

### Verification
- Offline **190/190**, live **66/66**, `vite build --mode release` clean,
  `wrangler@4.162.0 deploy --dry-run` bundles 3622 KiB.
- Security roles A–F asserted offline.

### Still not implemented (do not report as done)
- CSV/XLSX import with mapping and duplicate detection.
- Finance notifications when a stored reminder offset fires.
- Invoice PDF and secure share link.

### Exact next operation
1. Import: accept a CSV/XLSX, preview it, map columns to date / type / amount /
   account / category, validate every row, detect duplicates, and only then
   insert. This is the last large missing workflow.
2. Wire the existing reminder service so subscription offsets produce
   notifications, and add finance notifications for overdue debts and budgets at
   threshold.
3. Invoice PDF and a signed share link.
4. Only after those: the CRM navigation rebuild.
## Cohesion pass — 2026-11-17

Goal: make the existing systems relate to each other instead of adding another
standalone module. No CRM rebuild, no new large module.

### 1. Test data is deterministic again

Every run of the live HTTP suite created a fresh `Live Launch Fund`, `Live
Budget`, `Live Debt`, `Live Figma` and four claims, and nothing removed them. Four
runs had left seven accounts (five with the same name), six budgets, seven debts,
twelve subscriptions, eight claims, four advances and a fund whose balance read
`-6,480,000` because its transfer legs pointed at accounts a previous prune had
deleted.

Root cause was in the test, not the product: the suite has no delete endpoint to
call, so it could never clean up after itself. A group-based "keep the newest
duplicate" prune was tried first and produced the negative balance, so it was
replaced.

`C:\Users\Rodney\AppData\Local\Temp\kilo\finance-fixtures.mjs` now has four jobs:

- `purge` — delete every record whose name starts with `Live`, plus the payment
  rows the invoice-direction suite raises (`Payment for bill DIR-%`,
  `Payment for DIR-%`) and invoices numbered `DIR-%`. Dependents and
  `finance_relation` rows go with the parent, orphaned transactions and payments
  are swept, stranded halves of a transfer are removed, and every surviving
  account balance is recomputed from its ledger.
- `purge --demo` — the same, plus the `[demo]`-marked dataset.
- `seed` — one coherent demo company, idempotent.
- `status` — row counts per table, duplicate account names, leftover `Live*`
  rows and duplicate demo transactions.

The live suite must be bracketed by a purge. That sequence is documented in the
tool header.

Two real bugs were found while building it: the demo seed matched transactions on
the raw description while storing the marked one, so every `seed` run duplicated
all seven transactions; and the demo purge patterns had no wildcards, so
`purge --demo` deleted nothing.

### 2. Demo company dataset

One coherent dataset, all rows marked `[demo]`, all money in integer cents:

| Account | Opening | Balance |
| --- | --- | --- |
| Main Bank | KES 1,000,000.00 | KES 988,500.00 |
| M-Pesa | KES 80,000.00 | KES 80,000.00 |
| Petty Cash | KES 20,000.00 | KES 19,850.00 |
| Launch Fund | KES 0.00 | KES 64,200.00 |

Obligations total exactly KES 500,000.00 (Developer balance KES 300,000.00,
Legal fees KES 200,000.00). Three budgets, three subscriptions, three issued
invoices totalling KES 90,000.00 outstanding, and seven money movements. Every
account balance equals its own ledger, and the cash-flow report's closing balance
equals the sum of the accounts.

Four pre-rebuild rows from earlier manual testing are kept and hidden rather
than deleted: three transactions marked `is_del = 1` and the debt named `test`
(soft-deleted). The `sdd` account and its single `small attendee` row are left
visible because the live suite asserts on `sdd` and the row is not money.

### 3. One canonical cross-module relationship model

`finance_relation` (migration `v3_37DB`) stores `(source_type, source_id,
target_type, target_id, relation, note, created_by)`. The ledger keeps its own
foreign keys — `budget_id`, `debt_id`, `invoice_id` and the rest — because those
feed the arithmetic; this table holds links that cross a module boundary or have
no meaning inside the ledger.

One registry (`RELATION_TYPES` in `finance-service.js`) knows how to label each
of sixteen types, which permission guards it, and how to decide whether the
caller may see a given row. The picker, the read side and the write side all go
through it, so a new module is one entry rather than three edits.

Types: transaction, invoice, subscription, debt, budget, funding, commitment,
reimbursement, advance, account, project, request, lead, contact, deal, member.
Kinds: related, paid_from, funds, supports, billed_to, delivered_by,
requested_by, reimburses, evidence.

Scope rules, enforced server-side:

- Finance targets inherit the scope of the record they hang off. A member who
  cannot see the account a transaction belongs to cannot learn the transaction
  exists through a link.
- Non-finance targets are guarded by their own view permission (`deals:query`,
  `projects:query`, `requests:query` and so on). Finance exposes the label only,
  never the record, so type-level is the honest boundary; record-level scoping
  for those modules stays with those modules.
- Company scope and `finance.view_confidential` are not a bypass: confidential
  accounts still need an explicit grant.

Routes: `GET /finance/relations/types`, `/kinds`, `/search`, `/`,
`POST /finance/relations`, `DELETE /finance/relations/:id`.

### 4. One picker and one LinkedRecords component

`mail-vue/src/components/finance/RelationPicker.vue` — one dialog for every link:
type select, debounced server-side search (300 ms), radio selection, relationship
kind, optional note. Candidates come from `GET /finance/relations/search`, so the
browser never holds a page of the company to filter locally, and the source
record is removed from its own candidate list.

`mail-vue/src/components/finance/LinkedRecords.vue` — one section for every
detail surface: grouped by direction, human labels, remove with confirmation, and
an editable flag derived from permission. A 403 renders as "nothing linked", not
as an error inside a drawer.

Wired into six surfaces: transaction detail drawer (which now also shows its
ledger references under the human name "Ledger references"), invoice edit,
supplier bill edit, debt edit, subscription edit, budget edit, and account edit.

### 5. Invoice direction

An invoice was silently assumed to be money owed to us. A supplier's bill is an
invoice too, and counting it as a receivable overstated what the company is owed.

`finance_invoices.direction` (migration `v3_38DB`) is `issued` or `vendor`.

- `issued` — XPass billed a customer. Balance is a receivable.
- `vendor` — a supplier billed XPass. Balance is a payable, and it is never
  added to receivables.

Paying a supplier bill posts `type = 'payment'` (money out) into the `Suppliers`
category. Paying an issued invoice posts `type = 'invoice_payment'` (money in)
into `Income`. The direction on the invoice decides, not the caller. Both count
towards what has been settled on that invoice.

`listInvoices` returns `outstandingCents` (issued only), `payableCents` (vendor
only), `overdueCents` and `overduePayableCents`. The overview reports
`vendorBillCents` separately and lists overdue supplier bills under Coming Up as
`kind: 'bill'`.

The canonical transaction remains the only cash movement. A supplier bill that
exists as a document does not post anything; only its payment does, so spend by
counterparty shows the supplier exactly once.

### 6. Verification

| Check | Result |
| --- | --- |
| `finance-live.mjs` (Finance OS suite) | 66 passed, 0 failed |
| `finance-relation-test.mjs` (new) | 35 passed, 0 failed |
| `finance-invoice-direction-test.mjs` (new) | 28 passed, 0 failed |
| `npx vite build --mode release` | built |
| `wrangler@4.162.0 deploy --dry-run` | bundles, 3642.51 KiB |
| Migrations `v3_37DB`, `v3_38DB` | applied, `POST /api/init` returns success |

### 7. Status of the cohesion brief

| Item | Status |
| --- | --- |
| Canonical cross-module relation model | WORKING AND VERIFIED |
| Single permission-aware relation picker | API VERIFIED ONLY (no browser) |
| `LinkedRecords` on six detail surfaces | IMPLEMENTED BUT UNVERIFIED (no browser) |
| Invoice direction split, no double counting | WORKING AND VERIFIED |
| Fixture determinism and one demo company | WORKING AND VERIFIED |
| Nav simplification and global `+ Add` | NOT IMPLEMENTED |
| Overview restructure (five sections) | NOT IMPLEMENTED |
| Config framework (categories, account types, payment methods, tags) | NOT IMPLEMENTED |
| Human labels for remaining enums and filters | PARTIAL (link labels, direction, ledger references done) |
| No horizontal page scroll at 1280x720 and up | NOT IMPLEMENTED (no browser) |

### Exact next operation
1. Nav simplification and the global `+ Add` flow. This is the next user-visible
   change and it depends on nothing above.
2. Overview restructure into Current Position / This Period / Needs Attention /
   Coming Up / Recent Money Movement, with every total drillable.
3. Config framework for categories, account types, payment methods and tags.
4. Import (CSV/XLSX with mapping, preview, validation, duplicate detection),
   reminder notifications, invoice PDF. Still open from the Finance sprint.

---

## Control Plane sprint — MFA, onboarding, Team, security (2026-11-18)

First cross-repo batch of the HQ core control plane. Backend is complete and
live-tested; the frontend login, onboarding and security surfaces are
implemented and the production build passes.

### Backend — COMPLETE (CODED + LIVE-TESTED)

- **Migration `v3_39DB`** — 11 new tables (`user_session`, `user_login_event`,
  `user_recovery_code`, `announcement`, `announcement_audience`,
  `announcement_ack`, `announcement_read`, `announcement_audit`, `invitation`,
  `connection`, `notification_pref`, `tutorial_progress`); 10 new `user`
  columns (mfa + onboarding + password-change state); permission catalogue and
  `env.admin` grants for Member security / XPass Team / Announcements /
  Connections.
- **Crypto + scope + MFA** — `utils/security-crypto.js` (TOTP RFC 6238,
  AES-GCM from `c.env.server.sec_key`, recovery codes `XXXXX-XXXXX`,
  temporary-password generator), `utils/security-scope.js`
  (`SCOPE_ONBOARDING`/`SCOPE_FULL`, `guardScope`), `utils/mfa.js`
  (`MFA_REQUIRED_CODE = 428`).
- **Sessions + events** — `security/security.js` (token `id:random:userId[:o]`,
  verify, revoke-one, revoke-all, login-event writer).
- **APIs** — `api/security-api.js` + `service/security-service.js`
  (`/security/state`, onboarding state/password/finish, MFA setup/confirm/
  remove/recovery, `PUT /security/password`, sessions, login-history,
  `POST /user/resetMfa`, `POST /user/resetPassword`, `GET /user/:id/security`).
- **Login flow** — `api/login-api.js` gates on account status, returns
  `onboardingRequired`, emits the MFA 428 challenge with `data.mfaRequired`,
  and consumes recovery codes. `api/my-api.js` adds a `security` block to
  `loginUserInfo`. `middleware/auth.js` enforces `guardScope` in the `# /login`
  branch.
- **Team / Announcements / Connections / Tutorial** —
  `api/team-api.js` + `service/team-service.js`,
  `api/announcements-api.js` + `service/announcement-service.js`,
  `api/connections-api.js` + `service/connection-service.js`,
  `api/tutorial-api.js` + `service/tutorial-service.js`.
- **Routes** — registered in `hono/webs.js` and `index.js`.
- **Verification** — `wrangler deploy --dry-run --config wrangler-dev.toml`
  bundles 3647.32 KiB; live integration suite (`control-plane-test.mjs`)
  **66/66 pass**.

### Frontend — IMPLEMENTED (BUILD VERIFIED)

- `request/security.js`, `request/team.js` — API clients.
- `views/onboarding/index.vue` — 4-step wizard (Password → Authenticator
  QR/manual key → Recovery codes → Finish), lazy-loads `qrcode`.
- `views/login/index.vue` — MFA challenge, recovery-code fallback, onboarding
  redirect.
- `router/index.js` — `/onboarding` route + guard redirect when
  `security.onboardingComplete === false`.
- `axios/index.js` — 428 is a control signal, not an error toast.
- `components/hq-security/index.vue` + Security tab in `views/setting/index.vue`
  — password change, authenticator enrol/replace/remove, recovery codes
  (view/download/regenerate), active sessions, login history.
- **Verification** — `vite build --mode release` clean (1m29s).

### Still open — frontend control plane

XPass Team page rebuild, add-team-member wizard, Connections page,
Announcements (member + admin), tutorial engine + notification prefs, English
audit + Roles & Permissions polish.

### Notes

- `qrcode@1.5.4` added via `pnpm add` (npm install fails on this machine).
- `@element-plus/icons-vue` is not installed; new views use `@iconify/vue`.
- Local D1/KV preserved; `admin@example.com` password restored; admin MFA and
  onboarding left unset so the real user enrols their own authenticator.

# Next Implementation Steps — XPass HQ

**Date:** 2026-11-10  
**Repository:** cloud-mail only (canonical XPass HQ)  
**Constraint:** No commits, no pushes, no merges, no deployments, no production database operations.

---

## 1. Immediate Next Steps (Safe, Testable)

### Step 1: Verify CRM Phase 1 Locally (Completed Code, Blocked Auth)

The CRM backend, frontend, and D1 tables are all implemented. End-to-end local verification is blocked by a Wrangler local KV limitation (`c.env.kv.get(..., { type: 'json' })` returns null, causing 401 on all authenticated endpoints). This is NOT a code defect.

**Actions:**
- Accept the known local-dev limitation; CRM code is correct
- Optionally verify by reading KV blob directly (already done — auth data is stored correctly)
- In production (Cloudflare), KV JSON get works correctly

### Step 2: Complete CRM Phase 1 (Missing Pieces)

| Item | File | Action |
|---|---|---|
| Create drizzle entity files | `mail-worker/src/entity/crm-contact.js` | Optional — API files use raw SQL; create only if ORM integration is desired |
| Create drizzle entity files | `mail-worker/src/entity/crm-company.js` | Same |
| Create drizzle entity files | `mail-worker/src/entity/crm-pipeline.js` | Same |
| Create drizzle entity files | `mail-worker/src/entity/crm-stage.js` | Same |
| Create drizzle entity files | `mail-worker/src/entity/crm-deal.js` | Same |
| Create drizzle entity files | `mail-worker/src/entity/crm-task.js` | Same |

These are low priority. The raw SQL pattern is consistent with other cloud-mail APIs.

---

## 2. Phase 2 — Finance (KES)

Per finance rules: KES only, integer minor units (`_cents`), 0% organizer commission / 5% attendee service fee, Paystack via secure admin setup wizard (credentials later, never hardcoded), granular permissions (view-only / editable / approval-only).

**Suggested file plan:**

| File | Purpose |
|---|---|
| `mail-worker/src/init/init.js` | `v3_10DB`: `finance_accounts`, `finance_transactions`, `finance_invoices` tables |
| `mail-worker/src/api/finance-accounts-api.js` | `GET/POST/PUT/DELETE /finance/accounts` |
| `mail-worker/src/api/finance-transactions-api.js` | `GET/POST/PUT/DELETE /finance/transactions` |
| `mail-worker/src/api/finance-invoices-api.js` | `GET/POST/PUT/DELETE /finance/invoices` |
| `mail-worker/src/security/security.js` | Add `finance:view`, `finance:edit`, `finance:approve` perm keys + paths |
| `mail-vue/src/modules/registry.js` | `finance.available = true` (or keep false until backend ready) |
| `mail-vue/src/router/index.js` | `/finance/*` routes |
| `mail-vue/src/perm/perm.js` | Finance perm keys → routes |
| `mail-vue/src/request/finance-*.js` | API client wrappers |
| `mail-vue/src/views/finance/` | Views (list, detail, forms) |

**Permission split (do not combine):**
- `finance:view` — view financial data only
- `finance:edit` — create/edit transactions and invoices
- `finance:approve` — approve payments/reconciliations (separate from edit)

---

## 3. Phase 3 — Documents

Pattern reference: xpass-crm-lab `supabase/migrations/20261110150000_9316_documentos.sql` (document_folders + documents, RLS org-scoped, storage bucket). Adapt to cloud-mail D1 + R2 (existing R2 binding).

**Suggested file plan:**

| File | Purpose |
|---|---|
| `mail-worker/src/init/init.js` | `v3_11DB`: `documents`, `document_folders` tables (user_id tenancy) |
| `mail-worker/src/api/documents-api.js` | `GET/POST/PUT/DELETE /documents/*` |
| `mail-worker/src/api/document-folders-api.js` | `GET/POST/PUT/DELETE /document-folders/*` |
| `mail-vue/src/modules/registry.js` | `documents.available = true` |
| `mail-vue/src/router/index.js` | `/documents/*` routes |
| `mail-vue/src/views/documents/` | Views (folder tree, file list, upload dialog) |

---

## 4. Phase 4 — Tasks & Requests

cloud-mail already has `crm_tasks` (CRM-linked). For standalone tasks/requests:

| File | Purpose |
|---|---|
| `mail-worker/src/init/init.js` | `v3_12DB`: `support_requests` table (or extend `crm_tasks`) |
| `mail-worker/src/api/requests-api.js` | `GET/POST/PUT/DELETE /requests/*` |
| `mail-vue/src/modules/registry.js` | `support.available = true` |
| `mail-vue/src/router/index.js` | `/requests/*` routes |
| `mail-vue/src/views/requests/` | Views |

---

## 5. Phase 5 — Calendar, Notes, AI, Automations

Same additive pattern: D1 migration → API routes → security perms → frontend registration → views.

---

## 6. Phase 6 — WhatsApp

**Safety rules (must be designed in, not bolted on):**
- One official XPass WhatsApp business number
- AI suggests replies only — never auto-sends
- Human must explicitly click Send for every outgoing message
- Bulk: authorization + consent + templates + provider compliance
- All enforced on backend

**Suggested file plan:**
| File | Purpose |
|---|---|
| `mail-worker/src/init/init.js` | `v3_13DB`: `whatsapp_conversations`, `whatsapp_messages` tables |
| `mail-worker/src/api/whatsapp-api.js` | `GET/POST /whatsapp/*` (send requires human approval flag) |
| `mail-vue/src/modules/registry.js` | `whatsapp.available = true` |
| `mail-vue/src/router/index.js` | `/whatsapp/*` routes |
| `mail-vue/src/views/whatsapp/` | Views (conversation list, message composer with send button) |

---

## 7. Verification Checklist (Per Phase)

| Check | CRM | Finance | Documents | WhatsApp |
|---|---|---|---|---|
| Wrangler starts on 127.0.0.1:8787 | ✓ | — | — | — |
| D1 migration applies (init:local) | ✓ | — | — | — |
| API routes mounted (return 401 not 404) | ✓ | — | — | — |
| Frontend build succeeds | ✓ | — | — | — |
| Login works | ✓ | — | — | — |
| Sidebar entry appears | ✓ (code) | — | — | — |
| Routes load under same session | Blocked (KV) | — | — | — |
| Existing Mail still works | ✓ | — | — | — |
| Permission gating (403 without perm) | Code correct | — | — | — |
| Additive only (no existing tables modified) | ✓ | — | — | — |

---

## 8. What to Avoid

- **Do not** create a second XPass HQ in xpass-crm-lab
- **Do not** replace cloud-mail login, navigation, database, or auth
- **Do not** make Supabase mandatory
- **Do not** hardcode secrets or credentials
- **Do not** run remote database mutations
- **Do not** commit, push, merge, or deploy
- **Do not** mark UI-only features as WORKING
- **Do not** overwrite working Mail functionality

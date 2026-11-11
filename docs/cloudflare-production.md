# Cloudflare production deployment

Production Worker: `cloud-mail`, from `disaster1-tesk/cloud-mail` branch `main`.
Domains: `mail.happyaether.com` and `mail.zappo.work`.

Cloudflare Workers Builds settings:

- Root directory: `mail-worker`
- Build: `pnpm test:unit && pnpm --dir ../mail-vue install --frozen-lockfile && pnpm --dir ../mail-vue build`
- Deploy: `pnpm exec wrangler d1 migrations apply db --remote --config wrangler.production.toml && pnpm exec wrangler deploy --config wrangler.production.toml`
- Preview builds: disabled (feature branches must not deploy to production)
- Node.js: `24.14.1`; pnpm: `10.33.0`
- Reuse the existing `cloud-mail build token` in Cloudflare.

Push or merge changes to `main` to deploy. Cloudflare's build log is the source
of deployment status. The legacy GitHub Actions deployment is manual-only to
avoid two deployment systems publishing the same Worker.

`wrangler.production.toml` binds the existing D1 database and preserves runtime
variables and secrets managed in Cloudflare. It intentionally leaves custom
domains managed in the dashboard. `src/adapter/d1-kv.js` preserves the production
`kv_store` format for cached settings, sessions and attachments; do not remove it
unless those records have been migrated to another storage backend.

Production D1 changes belong in new numbered files under
`mail-worker/migrations/production`. Applied migrations must not be edited.
Migration `0001_forwarding.sql` upgrades the existing v3.3 database. It is not a
fresh installation schema. Migration `0002_forwarding_per_user.sql` adds the
`user_forward` table used by the per-user forwarding rework; the `account_forward`
table from `0001` is no longer referenced by code and is left in place. Changes to cached settings also require refreshing
the `setting:` cache through the application initialization/settings flow.

## Rollback

In Cloudflare, open Worker **Deployments**, select a known good version and
choose rollback. Alternatively use `pnpm exec wrangler rollback <version-id>
--config wrangler.production.toml` from `mail-worker`.

The pre-update version on 2026-11-11 was
`f2fb60e8-61c5-435d-815f-ed001090ad99`. The forwarding schema additions are
compatible with that version; leave the database intact when rolling back code.
Revert the corresponding Git commit on `main` to prevent a subsequent build
from redeploying the unwanted version.

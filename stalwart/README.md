# Stalwart integration for cloud-mail

This adds a private, LAN-hosted **Stalwart** as optional persistent JMAP mail
storage to a working [maillab/cloud-mail](https://github.com/maillab/cloud-mail)
deployment. The Stalwart WebUI and JMAP endpoint are reachable only through a
Cloudflare Tunnel at `https://jadmin.<DOMAIN>`; Stalwart itself binds
`127.0.0.1:8080` with no inbound ports. Outbound Stalwart mail relays through
Cloudflare Email Service.

**cloud-mail remains the primary mail system on `<DOMAIN>`.** MX, Email
Routing, `mail.<DOMAIN>`, the existing send path, and all D1/R2/KV bindings are
unchanged. The per-account mirror in `mail-worker/` is additive and **disabled
by default**; it never deletes or rewrites cloud-mail's own mail records.

## Design at a glance

```text
                         Cloudflare zone <DOMAIN>
  +----------------------------------------------------------------------+
  | MX @          --> Email Routing --> cloud-mail Worker email()         |
  |                                     (UNCHANGED)                      |
  | mail.<DOMAIN> --> cloud-mail webmail (UNCHANGED)                      |
  | cloud-mail   --> CF Email binding / Resend (UNCHANGED)                |
  |                                                                      |
  | jadmin.<DOMAIN> --> cloudflared tunnel --> Stalwart 127.0.0.1:8080    |
  |                       ^                        | MTA relay            |
  |                       | OPTIONAL Worker,        +-> smtp.mx.cloudflare.net:465
  |                       | no route, transparent                        |
  |                       +-- JMAP clients / Bulwark Lite (manual)        |
  +----------------------------------------------------------------------+
                                       private LAN, no inbound ports
```

Hostname ownership:

| Hostname | Owner | Served by |
| --- | --- | --- |
| `<DOMAIN>` (base) | cloud-mail | MX + Email Routing |
| `mail.<DOMAIN>` | cloud-mail | cloud-mail Worker custom domain |
| `jadmin.<DOMAIN>` | this add-on | Cloudflare Tunnel directly — **no Worker route** |
| front door Worker | this add-on (optional) | Script only — **no route**, `workers_dev = false`, no public hostname |

### Credential boundaries

There are exactly two credential sets per account. Keep them separate; they
are not interchangeable.

| Credential | Scope / storage | Used for |
| --- | --- | --- |
| **A. Mirror key**: `<API_KEY_NAME>` + `<API_KEY_SECRET>` | One narrow `Replace` key per cloud-mail account; secret sealed in D1 | Worker-only JMAP import to `https://jadmin.<DOMAIN>`; optional Stalwart submit |
| **B. Interactive login**: Stalwart user + password or app password | Entered at the client; browser session only, never stored in cloud-mail | Bulwark / JMAP clients through the front door |
| Access policy on `jadmin.<DOMAIN>` | Normal user session / Access login at the browser | No Access service token is attached to proxied requests |

- Per-account settings hold **only** `enabled`, the canonical
  `https://jadmin.<DOMAIN>` URL, the key name and the sealed secret (A).
- Credential B is never synced or injected by cloud-mail. An app password is
  preferable to the primary password because it is independently revocable;
  an OpenID connector is unnecessary for this merge.
- No Access service token is attached to proxied requests. Any caller that
  could reach the Worker would inherit it, so the proxy deliberately does not
  satisfy an Access policy on `jadmin.<DOMAIN>`; users sign in normally.
- Outbound relay keeps its own Cloudflare Email Sending token on the Stalwart
  host. Never reuse A, B or the edge secret there.

## What is in this repo

| Path | Purpose |
| --- | --- |
| `stalwart/src/index.ts` | Optional, transparent reverse-proxy Worker (no route, no workers.dev) |
| `stalwart/test/index.test.ts` | Unit tests for the proxy |
| `stalwart/wrangler.toml` / `wrangler-action.toml` | Worker config / deploy template |
| `stalwart/tunnel/config.example.yml` | `cloudflared` ingress for `jadmin.<DOMAIN>` |
| `stalwart/webmail/` | Optional Bulwark Lite static assets on `jmap.<DOMAIN>` (see §9) |
| `stalwart/docs/blobstore-migration.md` | Repair guide for v1.1.1 SQLite `Default` → `FileSystem` blob migration |
| `stalwart/scripts/migrate-sqlite-blobs-to-filesystem.py` | Read-only helper that copies SQLite blobs into the FileSystem layout |
| `mail-worker/src/stalwart/` | Token encryption, JMAP client, mirror queue and settings API |
| `mail-worker/test/stalwart/` | Unit tests for encryption and JMAP client (mocked `fetch`) |
| `mail-vue/src/layout/account/index.vue` | Per-account Stalwart settings dialog, including the webmail link |

## Red lines

1. **Do not change cloud-mail's mail flow.** No MX change, no `mail.<DOMAIN>`
   change, no new binding. The mirror starts after `completeReceive()` via
   `ctx.waitUntil`, so receive, forwarding, Telegram and webhooks are never
   blocked or skipped. D1 remains canonical: a successful Stalwart import never
   deletes the local mail record.
2. **No inbound port on the Stalwart host.** The HTTP listener binds
   `127.0.0.1:8080` only; only outbound TCP 465 is needed.
3. **Never route `jadmin.<DOMAIN>` to the Worker.** The tunnel serves it.
   Routing it to the Worker creates a fetch loop.
4. **`STALWART_PUBLIC_URL` must exactly equal the URL users type**, normally
   `https://jadmin.<DOMAIN>`. WebUI sign-in requires HTTPS and a matching
   public URL. This Worker does not rewrite discovery documents.
5. **The Worker never injects Stalwart credentials.** There is no
   `UPSTREAM_TOKEN`; client `Authorization` headers are passed to Stalwart
   unchanged. No Access service token is injected either — see §4.

## 1. Checkpoint: cloud-mail first

Before adding anything, confirm the existing system is healthy:

- [ ] Webmail login works at `mail.<DOMAIN>`.
- [ ] One external email can be sent.
- [ ] One external email can be received.
- [ ] MX still points to Cloudflare Email Routing, not to Stalwart.

If any of these fail, fix cloud-mail before continuing. Everything below is
independent of it.

## 2. Publish the Stalwart WebUI through the tunnel

### DNS

Create one proxied CNAME (usually done by `cloudflared tunnel route dns`):

```text
jadmin.<DOMAIN>   CNAME   <tunnel-id>.cfargotunnel.com   (proxied)
```

Do not create an A record or an MX on `jadmin.<DOMAIN>`.

### Stalwart

```bash
STALWART_PUBLIC_URL=https://jadmin.<DOMAIN>
```

- HTTP listener: bind `127.0.0.1:8080`, `implicitTls = false` — Cloudflare
  terminates TLS.
- Leave `proxyTrustedNetworks` and `overrideProxyTrustedNetworks` empty.
  Adding loopback there requires PROXY v2 and breaks plain HTTP from
  `cloudflared`.
- Add `jadmin.<DOMAIN>` to Stalwart's trusted/service hostnames so the WebUI
  sign-in is accepted as first-party.
- Restart Stalwart after environment changes.

### cloudflared

See [`tunnel/config.example.yml`](tunnel/config.example.yml). The ingress is a
single host:

```yaml
ingress:
  - hostname: jadmin.<DOMAIN>
    service: http://127.0.0.1:8080
    originRequest:
      httpHostHeader: jadmin.<DOMAIN>
  - service: http_status:404
```

Either a remotely-managed tunnel (dashboard token + `cloudflared service
install`) or a locally-managed config file works.

### Access

Put Cloudflare Access **only** in front of `jadmin.<DOMAIN>` if you want an
extra login layer. Never apply that policy to `mail.<DOMAIN>`.

If JMAP clients connect directly to `jadmin.<DOMAIN>`, they must satisfy the
Access policy too (browser Access session, or leave that path outside Access).
The optional front-door Worker does **not** carry a service token.

Verify:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' https://jadmin.<DOMAIN>/admin
# 200, or an Access redirect
```

## 3. Outbound mail: Stalwart → Cloudflare Email Service

Stalwart's MTA relays external mail to Cloudflare's authenticated SMTP
submission endpoint. This is the same pipeline cloud-mail already uses, so no
new sending system is introduced.

| Setting | Value |
| --- | --- |
| Host | `smtp.mx.cloudflare.net` |
| Port | `465` |
| Security | Implicit TLS (SMTPS), **not** STARTTLS on 587 |
| SMTP AUTH | `PLAIN` or `LOGIN` |
| Username | literal `api_token` |
| Password | Cloudflare API token with **Email Sending: Edit** |

Prerequisites:

- Enable **Email Service → Email Sending** on the Cloudflare account.
- Onboard `<DOMAIN>` under Email Sending. This is separate from Email Routing;
  MX records and Email Sending DKIM records coexist.
- Create a dedicated API token with only **Email Sending: Edit**. Store it on
  the Stalwart host as an environment variable, e.g.
  `CLOUDFLARE_EMAIL_TOKEN`. Do not commit it and do not put it in GitHub
  Actions for this repo.

Stalwart outbound route (WebUI: Settings → MTA → Outbound → Routes). Field
names follow Stalwart's object model; adapt to your installed version:

```json
{
  "@type": "Relay",
  "name": "cloudflare",
  "host": "smtp.mx.cloudflare.net",
  "port": 465,
  "protocol": "smtp",
  "implicitTls": true,
  "authUsername": "api_token",
  "authSecret": {
    "@type": "EnvironmentVariable",
    "variableName": "CLOUDFLARE_EMAIL_TOKEN"
  }
}
```

Outbound strategy: keep local delivery local, send everything else through
that route.

```text
if is_local_domain(rcpt_domain) then "local" else "cloudflare"
```

In Stalwart's expression syntax this is a `route` strategy with a match on
`is_local_domain(rcpt_domain)` returning `local`, otherwise `cloudflare`.

Operational notes:

- Cloud-mail and Stalwart share the account's sending quota and suppression
  list. Sending from both is fine, but watch volume.
- Let Cloudflare apply DKIM/ARC for submitted mail, or keep Stalwart signing —
  do not publish conflicting DKIM selectors without checking the dashboard.
- Cloudflare SMTP limits: 25 MiB message size, 50 recipients per session.
- Sender addresses (`MAIL FROM`) must be on an onboarded domain or submission
  fails with `550 5.7.1`.
- Only outbound TCP 465 needs to leave the LAN host.

**Rollback:** remove the relay route. cloud-mail's send path is untouched, so
it keeps working.

## 4. Optional Worker front door

The tunnel alone is enough for WebUI and JMAP. This Worker is an optional,
generic transparent proxy. It declares no route, so deploying it does not
expose any new hostname.

Properties of this proxy:

- Transparent: method, path, query, body, and client credentials pass through.
- No discovery rewriting and no URL substitution. Stalwart's own public URLs
  are returned unchanged, so `https://jadmin.<DOMAIN>` remains canonical. If
  discovery shows another origin, fix `STALWART_PUBLIC_URL` on Stalwart, not
  here.
- Forwards WebSocket upgrades (including `Sec-WebSocket-Protocol`), strips
  hop-by-hop headers, drops spoofed `X-Forwarded-*` / `CF-*` headers, and
  answers `/health` and `/healthz`.
- Does not inspect or replace `Authorization`. Never add a shared bearer token
  here; a token on an unauthenticated edge path would let anonymous callers
  act as that account.
- No Access service token is attached to upstream requests. If Access protects
  `jadmin.<DOMAIN>`, users authenticate themselves; the Worker does not bypass
  that policy.

### Deploy through the Action

The combined workflow's `Deploy-stalwart-front-door` job stays a no-op until
you set `STALWART_DOMAIN` to a **plain base domain** such as `example.com` (not
the `jadmin.` host, and not cloud-mail's JSON-array `DOMAIN`). It then calls the
version-pinned reusable action
`tankl-hass/plugin-stalwart/.github/actions/deploy-stalwart@v1.0.0`, which
deploys this routeless, hostless front door and the asset-only webmail together.
If Cloudflare Access protects `jadmin.<DOMAIN>`, let users sign in through
Access; the Worker never carries a service token that could bypass it.

### Manual deploy

```sh
cd stalwart
npm ci && npm run check
BASE_DOMAIN=example.com   # plain base domain, no scheme and no JSON array
sed "s|\${DOMAIN}|${BASE_DOMAIN}|g" wrangler-action.toml > wrangler.deploy.toml
npx wrangler deploy -c wrangler.deploy.toml
```

Local check:

```sh
cp .dev.vars.example .dev.vars   # set UPSTREAM_URL
npm run dev
curl -sS http://localhost:8787/health   # ok
```

### Notes from live Stalwart checks

- `/health` returned `ok`, and the JMAP session and discovery documents came
  back with the origin configured by `STALWART_PUBLIC_URL`. No proxy rewriting
  was needed — keep it that way.
- `/jmap/ws` upgraded to HTTP 101 with `Sec-WebSocket-Protocol: jmap`. A proxy
  that cannot relay the upgrade will break push silently; this Worker handles
  it, a plain HTTP-only proxy does not.
- The narrow per-account mirror key returned `forbidden` for `Email/query` and
  management calls. That is the intended shape: it cannot replace a user login
  at the front door, and the Worker must never inject it.
- When a static client is served from the same origin as the proxy, these paths
  must reach Stalwart unchanged: `/.well-known/jmap`, `/jmap/*` (including
  `/jmap/upload/{accountId}` and `/jmap/ws`), `/api/auth`, `/auth/token` and
  `/auth/register`. An `/api/auth` 400 before registration is a normal client
  probe, not a failure.
- Keep the upload flow as two steps: `POST /jmap/upload/{accountId}` returns a
  real `blobId`, then `Email/import` uses that id.

## 5. Verification and rollback

After each step, re-run the cloud-mail checkpoint from section 1.

| Check | Expectation |
| --- | --- |
| `https://jadmin.<DOMAIN>/admin` | 200 or Access redirect |
| Stalwart JMAP `/.well-known/jmap` | `apiUrl` starts with `https://jadmin.<DOMAIN>` |
| Stalwart outbound test message | accepted by CF SMTP (`250 2.0.0 Ok`), appears in Email Sending logs |
| `mail.<DOMAIN>` login, send, receive | unchanged |
| Cloudflare routes | no route for `jadmin.<DOMAIN>` |

Rollback, in order: remove the Stalwart relay route → remove the
`jadmin.<DOMAIN>` DNS record / tunnel route. No cloud-mail state is changed.

## 6. Per-account mirror (mail-worker / mail-vue)

Each account can optionally mirror incoming raw MIME into its Stalwart inbox.
Open an account's **⋯** menu → **Stalwart storage** to configure it.

| Field | Value |
| --- | --- |
| Enabled | Off by default; nothing is sent until switched on |
| Public JMAP URL | Exactly `https://jadmin.<DOMAIN>` or another validated public HTTPS origin (localhost/private IP literals are rejected; DNS names are owner-supplied) |
| API token | Narrow per-account Stalwart API key, write-only; leave the field blank to keep the saved token |

Token contract (create one key per account in Stalwart, mode **Replace**):

- Allowed: `authenticate`, `emailReceive`, `emailSend`, `jmapEmailGet`,
  `jmapEmailImport`, `jmapBlobUpload`, `jmapMailboxGet`, `jmapMailboxQuery`,
  `jmapIdentityGet`, `jmapEmailSubmissionCreate`.
- Never include `impersonate` or any `sys*` permission.
- Do not register webhooks with this key; that needs `sysWebHook*` and should be
  configured by an admin separately.

Storage and behaviour:

- The token is sealed with AES-256-GCM using a key derived from `jwt_secret`
  via HKDF-SHA256 (per-account info). Reads return only `hasToken`, never the
  secret. There is no plaintext fallback.
- On receive, `Email/import` is the acknowledgement. `session → Mailbox/query →
  upload raw blob → Email/import` supply the real `blobId` (creation ids like
  `#u0` are rejected by Stalwart). All four fetches share one 25-second
  deadline so a slow tunnel cannot outlive the receive invocation's
  `ctx.waitUntil()` window; on timeout the message is queued instead of lost.
- A failed import is queued in `stalwart_queue` with exponential backoff and is
  retried by the existing hourly cron. Only a small reference is stored in D1;
  the raw MIME lives in the existing R2 bucket (or KV when R2 is unset), so
  large messages cannot exceed the D1 row limit. No new binding, queue or cron
  trigger is added. Each drain is capped at 3 rows to stay under the free-tier
  subrequest budget, claims rows before mirroring to avoid duplicate imports,
  and keeps them queued on transient/configuration errors.
- Recovery details: stale `processing` claims (e.g. from a killed invocation)
  are reset after 10 minutes; the queue row is deleted **before** its raw blob
  is dropped, so a failed D1 delete cannot orphan an in-flight message; 401/403
  is retried up to 3 times before a payload is discarded, so a briefly rejected
  token does not lose mail.
- **Manual retry first probes `/jmap/ws`** with a short authenticated upgrade.
  If the tunnel/token/websocket endpoint is offline, nothing is drained. The
  WebSocket is never held open. Manual retry also honours the same backoff as
  the cron, and is limited to once per account per minute (KV TTL) so a stuck
  button cannot hammer the tunnel or exhaust the subrequest budget.
- The settings dialog shows the **queued mirror message count** and the raw
  store (`r2`/`kv`) after each save or retry, so a growing backlog is visible
  without inspecting D1 directly.
- Mirror status is advisory only: no extra Durable Object notifications are
  sent, and failures never reject an incoming message.

Rollback: switch the account's mirror off (or clear its token). Cloud-mail's
D1 mail records are untouched, so no recovery step is needed.

## 7. Deploying this combined change

The tunnel Worker in `stalwart/` is optional and has no route or public hostname
by default. When `STALWART_DOMAIN` is set, the combined workflow calls the
version-pinned
`tankl-hass/plugin-stalwart/.github/actions/deploy-stalwart@v1.0.0` action to
co-deploy the routeless, hostless front door and the asset-only webmail; with no secret it
is a no-op and cloud-mail deploys exactly as before. The `mail-worker/` and
`mail-vue/` changes are additive migrations; run the usual `/init` once after
deploy so the new account columns, the `stalwart_queue` table and its
`claimed_at` column are created (the migration is idempotent). The narrow
credential contract above is what the per-account settings expect.

## 8. Free-tier quotas and limits

Verified against the Cloudflare docs on **2026-11-21**. Plans and limits change;
re-check the linked pages before relying on a number.

| Component | Free-plan limit | Relevance to this repo |
| --- | --- | --- |
| Workers requests | **100,000/day per account**, resets 00:00 UTC; over quota returns Error 1027 | Shared by cloud-mail, the optional front door and every other Worker in the account. The mirror adds **no inbound request** per message (it runs inside the receive request via `ctx.waitUntil()`); each manual retry click costs one request. |
| Workers subrequests | **50 external subrequests per invocation** (plus up to 1,000 to Cloudflare services); configurable with `[limits].subrequests` | One mirrored message uses four external calls (`session`, `Mailbox/query`, upload, `Email/import`). The hourly drain is capped at **3 rows**, plus a batched account lookup and one claim + one delete/release per row. The manual probe adds two calls (`/jmap/session` and the brief `/jmap/ws` upgrade). |
| Workers CPU time | **10 ms per invocation** (HTTP and Cron); network I/O does not count | The integration is I/O-bound; no new CPU-heavy parsing is introduced. |
| Workers connections | **6 simultaneous connections waiting for response headers** per invocation | Per-row calls are awaited sequentially, so the mirror never opens six parallel uploads. |
| `ctx.waitUntil()` | Extends execution **up to 30 s** after the response is sent | The initial mirror attempt uses per-fetch timeouts of 15 s. Four slow calls can outlast the 30 s window; either lower the JMAP timeout or accept that a stalled attempt may be cut off before it can enqueue a retry. |
| Cron Triggers | **5 per account**; **15 min** wall time per invocation | This change adds **zero** triggers — retries reuse the existing hourly `0 * * * *`. Sustained retries are capped at roughly 3 rows/hour × 24 = 72 rows/day unless manual retries are used. |
| D1 | **500 MB per database**, **5 GB per account**; **2,000,000 bytes** max string/row; **50 queries per Worker invocation**; 7-day Time Travel | Raw MIME is stored in R2/KV, not D1, so a large message cannot exceed the row limit. `stalwart_queue` holds only ids, a short reference and error text. The drain uses ~8–10 D1 queries per invocation. |
| R2 (preferred queue store) | **10 GB-month storage/month**, **1 M Class A** (writes/lists), **10 M Class B** (reads/heads), deletes and egress free | A failed message occupies R2 only until its retry succeeds and the object is deleted. No new bucket or binding is needed — the existing cloud-mail R2 binding is reused. |
| Workers KV (fallback only) | **100,000 reads/day**, **1,000 writes/day** to different keys (1 write/s per key), **1 GB storage**, 25 MiB value | Used only when R2 is unavailable. A high retry volume can exhaust the daily write allowance; keep the existing R2 binding configured. |
| Durable Objects | **5 GB total storage** on Free; 100 classes/account | The existing `MailHub` WebSocket fan-out is unchanged. No DO is created per account and no per-row sync notifications are sent. |
| Cloudflare Tunnel | **1,000 tunnels/account**, **25 active replicas/tunnel**, 50,000 routes; published apps bounded by a 1 MB config | One tunnel and one hostname (`jadmin.<DOMAIN>`) are added. The tunnel is outbound-only; no inbound port is opened. |
| Cloudflare Access (optional) | Zero Trust Free covers **up to 50 users**; **50 service tokens/account** | Only needed if you put Access in front of the tunnel. Users authenticate themselves; the front door attaches no service token. |
| Email Routing / Email Sending | Unchanged by this repo; their own plan limits still apply | MX, Email Routing, `mail.<DOMAIN>` and the outbound send path are not modified. |

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[KV limits](https://developers.cloudflare.com/kv/platform/limits/),
[Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/),
[Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/),
[Cloudflare One account limits](https://developers.cloudflare.com/cloudflare-one/account-limits/),
[Zero Trust plans](https://www.cloudflare.com/plans/zero-trust-services/).

**Monitoring the quotas:** Workers & Pages → the Worker → **Metrics** for requests,
subrequest errors and `exceededCpu`/`exceededMemory`; **Settings → Triggers → View
events** for cron history (100 most recent invocations); Workers Logs for Error
1027, Error 1102 and D1 "overloaded"/"Too many API requests" errors. R2/KV and D1
storage usage is shown in their respective dashboard sections. A growing
`stalwart_queue` means the hourly drain cannot keep up with failures — check the
tunnel and the Stalwart token before raising the batch size; raising it directly
trades against the 50-subrequest budget above.

## 9. Optional webmail: Bulwark Lite (static assets only)

This is an **optional, manually deployed** companion for viewing the mirrored
mail. It is not part of the default setup and is not wired into cloud-mail. It
publishes the webmail UI on `https://jmap.<DOMAIN>` as a Custom Domain;
`jadmin.<DOMAIN>` remains the only JMAP endpoint and is untouched.
[`bulwarkmail/webmail`](https://github.com/bulwarkmail/webmail) publishes
**Bulwark Lite** as a static folder; the scaffold lives in
[`webmail/`](webmail/) in this repo and is deployed as a **Workers static-assets
project with no Worker script**. Static-asset requests are free and unlimited, so
the UI does not spend the 100,000/day Worker request budget; JMAP traffic still
goes straight to `https://jadmin.<DOMAIN>` through the tunnel.

### 9.1 Why this shape

- **Assets stay here.** `webmail/` holds the pinned release, its SHA-256, the
  rendered `config.json`, an asset-only `wrangler.toml` for local dev and a
  `wrangler-action.toml` template. Nothing is committed from the upstream zip:
  `deploy.sh` downloads and verifies it at deploy time.
- **One new hostname, for the UI only.** `deploy.sh` renders a gitignored
  `wrangler.deploy.toml` with a `custom_domain` on `jmap.<DOMAIN>`. Cloudflare
  creates the DNS record and certificate, so `jmap` must not already have a
  CNAME. The Worker has no `main`; `jadmin.<DOMAIN>` remains the single JMAP
  endpoint and `STALWART_PUBLIC_URL` is unchanged.
- **Future tab, not a new site.** The intended end state is a single tab in the
  cloud-mail UI, shown to every account. When that happens, serve this same
  `dist/` from cloud-mail's own origin (for example `/stalwart-webmail/*`) so
  the tab is same-origin and needs no separate hostname. That change is
  deliberately **not** made here: cloud-mail's routes, bindings and UI are
  untouched by this PR.

### 9.2 Settings reference (`webmail/config.example.json`)

Copy the template by running `deploy.sh`; it replaces `example.com` with your
`DOMAIN`. Every key below is read at page load, so a re-upload is the whole
change process.

| Key | Value used here | Why |
| --- | --- | --- |
| `appName` | `Stalwart Mail (mirror)` | Identifies the tab/window as the mirror, not the primary mailbox. |
| `jmapServerUrl` | `https://jadmin.<DOMAIN>` | **Pin it explicitly.** Leaving it empty shows a server field and makes the client guess from the login address (`mail.`, apex, `jmap.`), which would point at cloud-mail or at the UI itself. |
| `allowCustomJmapEndpoint` | `false` | Stops a user from typing another JMAP host. Only shown by default when `jmapServerUrl` is empty, but set it explicitly. |
| `jmapServers` / `jmapServerAutoPickByDomain` | `[]` / `false` | No domain-based server list that could auto-pick the wrong host. |
| `rememberMeEnabled` | `false` | No Stalwart refresh token in `localStorage`; Basic credentials stay in `sessionStorage` for the lifetime of the tab. |
| `loginShowRememberMe` | `false` | Do not offer the checkbox that would re-enable the above. |
| `demoMode` | `false` | No built-in demo account. |
| `noThirdPartyTraffic` | `true` | Keeps the browser off every built-in outside host (avatars, telemetry, etc.). |
| `loginShowTotp` | `true` | Keep if the Stalwart user account has TOTP; set to `false` if it doesn't. |
| `loginShowVersion` | `false` | Minor branding/privacy choice. |
| `oauthRevokeOnSignOut` | `true` | No effect for Basic login; harmless to keep. |
| `sourceCodeUrl` | upstream repo | Keeps the About screen attribution. |

Do **not** set `LITE_JMAP_SERVER_URL` at build time — we deploy the stock release
zip and change only `config.json`.

### 9.3 One-time Stalwart setting

The browser calls `jadmin.<DOMAIN>` from the asset origin, so Stalwart must allow
that origin. In Stalwart 1.1.1 there is no per-origin allow-list on the `Http`
object: enable **Settings → Network → HTTP → Security → Permissive CORS policy**
(`usePermissiveCors = true`) and reload settings:

```sh
stalwart-cli update Http --field usePermissiveCors=true
stalwart-cli create Action/ReloadSettings
```

This does not open any endpoint — JMAP authentication still applies to every
request. It only adds `Access-Control-Allow-Origin: *` plus the `Authorization`
and `Content-Type` headers. If you prefer not to enable it, put an equivalent
same-origin reverse-proxy rule in front of Stalwart and point `jmapServerUrl` at
that origin instead; do not change `STALWART_PUBLIC_URL`.

The live static-client test used that same-origin shape. The proxy had to pass
`/.well-known/jmap`, `/jmap/*` (including `/jmap/upload/{accountId}`),
`/api/auth`, `/auth/token` and `/auth/register` through unchanged, and relay the
`/jmap/ws` upgrade separately — a plain HTTP-only proxy cannot do the 101
upgrade. The optional front door in §4 already handles these paths.

### 9.4 Manual deploy

```sh
cd stalwart/webmail
DOMAIN=<DOMAIN> ./deploy.sh                  # download, verify, unpack, render config
# review dist/config.json and dist/_headers
DOMAIN=<DOMAIN> ./deploy.sh --deploy         # prepare, then wrangler deploy
```

`deploy.sh` pins Bulwark Lite **1.21.3** and verifies
`3cbccac8d9b37104829e884be8c28814a1b095ca089e068168ed456d9cca0c6b` before
unpacking. Upgrade by changing both `BULWARK_LITE_VERSION` and
`BULWARK_LITE_SHA256` together. `dist/`, `config.json` and `*.zip` are
gitignored, as is the rendered `wrangler.deploy.toml`. The manual command above
is still available, and the same script is used by the pinned
`deploy-stalwart@v1.0.0` Action when `STALWART_DOMAIN` is set, publishing the
UI at `https://jmap.<DOMAIN>`; an asset refresh only happens in that opt-in job,
never from a mail-worker-only change. `BULWARK_LITE_VERSION`,
`BULWARK_LITE_SHA256` and `WEBMAIL_WORKER_NAME` are the only overrides
`deploy.sh` accepts.

It also hardens three easy-to-miss details:

- **`DOMAIN` is validated** as a bare hostname (no scheme, path, query or shell
  metacharacters) before it is rendered into `config.json`, and the rendered
  file is parsed back with Python's `json` module to confirm `jmapServerUrl`,
  `allowCustomJmapEndpoint: false` and `noThirdPartyTraffic: true`.
- **The stock CSP is tightened.** The release ships `connect-src 'self' *`;
  the script rewrites that to `connect-src 'self' https://jadmin.<DOMAIN>` in
  `dist/_headers` so a page compromise cannot open arbitrary connections.
- **The Worker name is overridable.** `wrangler.toml` has a default name, but
  `deploy.sh` always passes `--name`, so it cannot overwrite an unrelated
  Worker in your account. Set `WEBMAIL_WORKER_NAME=<unique-name>` if
  `cloud-stalwart-webmail` is already taken. Deployment is asset-only
  (no `main`); the rendered config adds exactly one Custom Domain,
  `jmap.<DOMAIN>`.

Then open `https://jmap.<DOMAIN>` and sign in with a **normal Stalwart user
account**. Never use the narrow per-account mirror API key — it
has only `jmapEmailGet`/`jmapEmailImport`-style permissions and no `Email/query`
or `Mailbox/query`, so a webmail login with it would fail. Leave that key exactly
as documented in §6.

The live client test confirmed the sign-in sequence: an initial `/api/auth` 400
is the client's capability probe; `/auth/register` and `/auth/token` then set up
the browser session before JMAP calls succeed. No Stalwart password is written
to cloud-mail or to `config.json`.

To remove the optional UI: `wrangler delete --name <worker-name>` (roll back a
bad deploy with `wrangler rollback --name <worker-name>` instead). Nothing else
in the deployment changes; no DNS record or tunnel route exists to
clean up.

### 9.5 In-app entry from cloud-mail

The per-account Stalwart settings dialog shows an **Open webmail ↗** link when
`STALWART_WEBMAIL_URL` is set; set it to `https://jmap.<DOMAIN>`. It is plain
deployment config, not a credential:
the link is shown to every account and never contains or injects a token. The
user signs in with a normal Stalwart account after following it. The separate
mirror token is used only by the server-side delivery bridge and has no bearing
on webmail login or on whether this link appears. No cloud-mail route, menu item
or UI outside that dialog changes.

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars    # set UPSTREAM_URL
npm run dev                        # http://localhost:8787
npm run check                      # typecheck + tests
```

## Configuration reference

| Name | Kind | Description |
| --- | --- | --- |
| `DOMAIN` | Action secret | Base domain, plain string; injected into the deploy template |
| `STALWART_DOMAIN` | Action secret/var | Plain base domain for the optional front-door job; do not use cloud-mail's JSON-array `DOMAIN` here |
| `STALWART_WEBMAIL_URL` | Action secret/var | Set to `https://jmap.<DOMAIN>`; shown in every account's Stalwart settings (§9.5) |
| `UPSTREAM_URL` | derived var / local secret | Tunnel hostname, e.g. `jadmin.example.com`; bare hostname means HTTPS:443 |
| `workers_dev` | config | `false` for the front door so it has no public hostname |
| `PATH_PREFIX` | var | Optional prefix stripped before forwarding |
| `CORS_ORIGIN` | var | Optional `Access-Control-Allow-Origin` value |
| `STALWART_PUBLIC_URL` | Stalwart env | Must be exactly `https://jadmin.<DOMAIN>` |
| `CLOUDFLARE_EMAIL_TOKEN` | Stalwart host env | API token with Email Sending: Edit, used as SMTP password |

## License

MIT — see [LICENSE](LICENSE).

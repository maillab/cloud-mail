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
  |                                              | MTA relay              |
  |                                              +-> smtp.mx.cloudflare.net:465
  +----------------------------------------------------------------------+
                                       private LAN, no inbound ports
```

Hostname ownership:

| Hostname | Owner | Served by |
| --- | --- | --- |
| `<DOMAIN>` (base) | cloud-mail | MX + Email Routing |
| `mail.<DOMAIN>` | cloud-mail | cloud-mail Worker custom domain |
| `jadmin.<DOMAIN>` | this add-on | Cloudflare Tunnel directly — **no Worker route** |

## What is in this repo

| Path | Purpose |
| --- | --- |
| `stalwart/src/index.ts` | Optional, transparent reverse-proxy Worker (no route) |
| `stalwart/test/index.test.ts` | Unit tests for the proxy |
| `stalwart/wrangler.toml` / `wrangler-action.toml` | Worker config / deploy template |
| `stalwart/tunnel/config.example.yml` | `cloudflared` ingress for `jadmin.<DOMAIN>` |
| `mail-worker/src/stalwart/` | Token encryption, JMAP client, mirror queue and settings API |
| `mail-worker/test/stalwart/` | Unit tests for encryption and JMAP client (mocked `fetch`) |
| `mail-vue/src/layout/account/index.vue` | Per-account Stalwart settings dialog |

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
5. **The Worker never injects credentials.** There is no `UPSTREAM_TOKEN`.
   Client `Authorization` headers are passed to Stalwart unchanged.

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
Access policy too (service token, or leave that path outside Access). An
optional front-door Worker can carry a service token via `ACCESS_CLIENT_ID` /
`ACCESS_CLIENT_SECRET`.

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

```sh
npm ci
npm run check
npx wrangler deploy -c wrangler-action.toml   # after replacing ${DOMAIN}
```

Set the `DOMAIN` Action secret to a plain string such as `example.com`; the
workflow renders `UPSTREAM_URL = "jadmin.example.com"`.

Properties of this proxy:

- Transparent: method, path, query, body, and client credentials pass through.
- No discovery rewriting and no URL substitution. Stalwart's own public URLs
  are returned unchanged, so `https://jadmin.<DOMAIN>` remains canonical.
- Forwards WebSocket upgrades, strips hop-by-hop headers, drops spoofed
  `X-Forwarded-*` / `CF-*` headers, and answers `/health` and `/healthz`.
- Does not inspect or replace `Authorization`. Never add a shared bearer token
  here; a token on an unauthenticated edge path would let anonymous callers
  act as that account.

Local check:

```sh
curl -sS http://localhost:8787/health   # ok
```

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
| Public JMAP URL | Exactly `https://jadmin.<DOMAIN>` or another validated public HTTPS origin (localhost/private IPs are rejected) |
| API token | Narrow per-account Stalwart API key, write-only |

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
  `#u0` are rejected by Stalwart).
- A failed import is queued in D1 (`stalwart_queue`) with exponential backoff
  and is retried by the existing hourly cron. No new queue binding or cron
  trigger is added.
- **Manual retry first probes `/jmap/ws`** with a short authenticated upgrade.
  If the tunnel/token/websocket endpoint is offline, nothing is drained. The
  WebSocket is never held open.
- Every Stalwart status notification is advisory; failures never reject an
  incoming message.

Rollback: switch the account's mirror off (or clear its token). Cloud-mail's
D1 mail records are untouched, so no recovery step is needed.

## 7. Deploying this combined change

The tunnel Worker in `stalwart/` is optional and has no route by default. The
`mail-worker/` and `mail-vue/` changes are additive migrations; run the usual
`/init` once after deploy so the new account columns and `stalwart_queue`
table are created. The narrow credential contract above is what the per-account
settings expect.

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
| `UPSTREAM_URL` | derived var / local secret | Tunnel hostname, e.g. `jadmin.example.com`; bare hostname means HTTPS:443 |
| `ACCESS_CLIENT_ID` | Worker secret | Optional Access service token ID |
| `ACCESS_CLIENT_SECRET` | Worker secret | Optional Access service token secret |
| `PATH_PREFIX` | var | Optional prefix stripped before forwarding |
| `CORS_ORIGIN` | var | Optional `Access-Control-Allow-Origin` value |
| `STALWART_PUBLIC_URL` | Stalwart env | Must be exactly `https://jadmin.<DOMAIN>` |
| `CLOUDFLARE_EMAIL_TOKEN` | Stalwart host env | API token with Email Sending: Edit, used as SMTP password |

## License

MIT — see [LICENSE](LICENSE).

# Cloud Mail MCP endpoint

Exposes the mail service over MCP (Model Context Protocol, Streamable HTTP,
stateless) at `POST /mcp/` on the same Worker that serves the web UI and the
`/api/` API. No new npm dependencies; the handler reuses the existing
service layer (`email-service`, `account-service`, `user-service`).

## Routing

`src/index.js` branches on `/mcp` and `/mcp/` BEFORE the static-assets
fallback, so the endpoint never collides with the Vue SPA. Only POST (MCP
calls) and OPTIONS (CORS preflight) are intercepted: a plain GET `/mcp`
still falls through to the SPA, so the Vue landing page at route `/mcp`
loads on refresh and direct links. Everything else is unchanged: mail-app
authentication, bindings and `wrangler.toml` values are untouched.

## Environment variables (set as Worker secrets/vars in Cloudflare)

- `MCP_AUTH_KEY` (required, secret): the bearer key MCP clients must send as
  `Authorization: Bearer <key>`. If it is unset, EVERY MCP call is rejected
  with a configuration error — the endpoint is never open. Never commit a
  real value to the repo.
- `MCP_WRITE_ENABLED` (optional, default off): set exactly to `true` to list
  and allow the write tools. Any other value (including unset) hides them
  from `tools/list` entirely.

## Protocol

- JSON-RPC 2.0 over plain JSON responses (no SSE streams, no session id).
- Methods: `initialize` (negotiates `protocolVersion`, server
  `cloudmail-mcp` version `0.1.0`), `notifications/initialized`,
  `tools/list`, `tools/call`, `ping`.
- Error codes: `-32700` parse, `-32600` invalid request, `-32601` method
  not found, `-32602` invalid params, `-32603` internal, `-32000` MCP not
  configured (key unset, HTTP 500), `-32001` unauthorized (HTTP 401).
- Tool execution failures are returned as MCP `isError` content, not as
  JSON-RPC errors, so agents see the reason in-band.
- CORS preflight (`OPTIONS`) is answered for browser-based MCP clients.
- The handler logs nothing: no keys, tokens, subjects, or mail bodies.

## Tools

Tools act as the instance admin user (`env.admin`, resolved via
`userService.selectByEmail`). The bearer key is therefore admin-equivalent:
guard it like an admin password.

Read tools (always listed):

| Tool | Service mapping | Notes |
| --- | --- | --- |
| `accounts_list` | `accountService.list` (size 30) | Returns id, email, name only. |
| `mail_list` | `emailService.list` | `accountId` required; `type` 0 inbox / 1 sent; `size` max 50; `emailId` descending cursor; `full=1` full content + attachment metadata, `full=0` brief. |
| `mail_search` | `emailService.allList` | Admin-wide; `name`, `subject`, `accountEmail`, `userEmail` are case-insensitive PREFIX filters; `type` receive/send/delete/noone (default receive). |
| `mail_get` | bounded scan of `emailService.list` (full=1) | Inbox then sent, newest first, up to 5 pages of 50 per mailbox per account, 20 pages total. No single-mail GET exists in the mail API, hence the scan. |

Write tools (only when `MCP_WRITE_ENABLED === 'true'`):

| Tool | Service mapping | Notes |
| --- | --- | --- |
| `mail_send` | `emailService.send` (`sendType: ''`) | New mail; `receiveEmail` non-empty, `subject` required. |
| `mail_reply` | `emailService.send` (`sendType: 'reply'`) | Recipients default to the original sender (`senderEmail` else `sendEmail`); subject defaults to `Re: <original subject>`; requires content or text. |
| `mail_forward` | `emailService.send` (`sendType: 'forward'`) | Subject defaults to `Fwd: <original subject>`; content/text default to the original body. |
| `mail_delete` | `emailService.delete` | Soft delete by default; permanent only when the instance has sync-delete enabled. |
| `account_add` | `accountService.add` | Domain and prefix rules apply; if the instance requires a verification token, the call fails rather than bypassing it. |
| `account_delete` | `accountService.delete` | Refuses to delete the login user's main mailbox (service-level guard). |

Out of scope for v1 (same as the standalone server): user/role/registration-key
management, permanent delete, mark-read/star/move, attachment download.

## Frontend

The landing page lives at `/mcp` in the Vue app
(`mail-vue/src/views/mcp/index.vue`), linked from the sidebar
(`mail-vue/src/layout/aside/index.vue`, static entry, no permission key —
the page itself shows no mail data and the endpoint carries its own bearer
auth). Its deploy prompt text lives in
`mail-vue/src/views/mcp/deploy-prompt.js`; the public reference copy at
`mail-vue/public/mcp-deploy-prompt.txt` is generated from that module so the
two stay identical. The prompt never contains a key: it instructs the agent
to ask the user for the key before configuring anything.

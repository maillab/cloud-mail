# cloud-mail-mcp

A stdio [MCP](https://modelcontextprotocol.io/) server that lets an AI agent
list, search, read, and send mail through the cloud-mail REST API.

It authenticates once as the cloud-mail admin account and exposes the
following 7 tools:

| Tool | Description |
|---|---|
| `list_emails` | List emails in a mailbox (account). Get `accountId` from `list_accounts` first. |
| `latest_emails` | Get received emails newer than a given `emailId` (polling). |
| `search_all_emails` | Admin-wide search across ALL users' emails with filters. |
| `get_attachments` | List downloadable attachments of an email. |
| `send_email` | Send an email from one of the mailbox accounts. |
| `mark_read` | Mark emails as read. |
| `list_accounts` | List the mailbox accounts (addresses) available to the agent. |

> **Known backend caveat:** `mark_read` calls a cloud-mail backend endpoint
> that builds but does not `.run()` the database update. It always returns
> success but the read state may not actually persist. This is a backend
> limitation, not a bug in this MCP server — it is not fixed here.

## Environment variables

See `.env.example`:

- `CLOUD_MAIL_URL` — base URL of the cloud-mail deployment (e.g.
  `https://webmail.example.com`).
- `CLOUD_MAIL_USER` — admin login email.
- `CLOUD_MAIL_PASSWORD` — admin login password.

Because the configured user is the cloud-mail admin, all RBAC permission
checks on the backend are bypassed, so every tool works with this one
credential (v1 design decision — see `PLAN.md`).

## Build

```bash
npm install
npm run build
```

This compiles `src/` to `dist/` (entry point `dist/index.js`).

## Run standalone

```bash
npm start
```

Reads `CLOUD_MAIL_URL`, `CLOUD_MAIL_USER`, `CLOUD_MAIL_PASSWORD` from the
process environment or a `.env` file next to the server, and speaks MCP over
stdio.

## Manual smoke test

```bash
npm run smoke
```

Loads `.env` (create it from `.env.example` with real credentials), logs in,
and prints the results of `list_accounts` and `list_emails` to confirm
end-to-end connectivity. Not run in CI.

## MCP host config

The server loads its credentials from the gitignored `.env` next to it, so the
host config needs only the command — no secrets in the host config:

```json
{
  "mcpServers": {
    "cloud-mail": {
      "command": "node",
      "args": ["<abs-path>/mcp-server/dist/index.js"]
    }
  }
}
```

Create `<abs-path>/mcp-server/.env` from `.env.example` with your real
`CLOUD_MAIL_URL` / `CLOUD_MAIL_USER` / `CLOUD_MAIL_PASSWORD`. The `.env` is
resolved relative to the server's own location, so the working directory the
host launches it from does not matter. (You can still pass the variables through
the host's `env` block instead if you prefer.)

## Scope (v1)

Out of scope for this version (see `PLAN.md` §5):

- A dedicated `agent` RBAC role/user (the admin account is used for v1).
- Attachment upload on send, or attachment download bytes (only attachment
  *listing* via `get_attachments`).
- Remote/OAuth MCP transport (stdio only).
- Retries beyond the single 401 re-login.

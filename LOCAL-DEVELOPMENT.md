# Local development

The local environment runs the Vue application and Cloudflare Worker on your machine. Wrangler uses only local D1, KV, and R2 persistence; the dev Worker has no Cloudflare Email, AI, or remote bindings. Do not add production credentials to local settings.

## First-time setup

From the repository root:

1. Generate a private, ignored Worker secret:

   ```powershell
   pnpm --dir mail-worker setup:local
   ```

2. Build the frontend assets required by the Worker:

   ```powershell
   pnpm --dir mail-vue build
   ```

   The build currently completes with a pre-existing Vite warning about `NODE_ENV=release` in `.env.release`; production configuration is intentionally unchanged.

3. Start the Worker in one terminal:

   ```powershell
   pnpm --dir mail-worker dev
   ```

   Wait for Wrangler to report that it is listening on `http://127.0.0.1:8787`.

4. In another terminal, initialize the local D1 schema and create the disposable test account:

   ```powershell
   pnpm --dir mail-worker init:local
   ```

   The command prints a newly generated password once. Use it with **admin@example.com** at the frontend. The seed includes a sample Inbox message. Running `init:local` again reinitializes the schema, resets this account and preview message, and prints a new password.

5. Start Vite in another terminal:

   ```powershell
   pnpm --dir mail-vue dev
   ```

   Open `http://localhost:3001`. The dev frontend already targets `http://127.0.0.1:8787/api`.

## Shutdown and reset

- Stop each server with **Ctrl+C** in its terminal.
- To reset local database, KV, and R2 state, stop Wrangler and run:

  ```powershell
  pnpm --dir mail-worker reset:local
  ```

  Then run `pnpm --dir mail-worker init:local` after restarting Wrangler. This removes only `mail-worker/.wrangler/local`. It does not touch Cloudflare resources or other Wrangler state.
- `mail-worker/.dev.vars` holds a generated local-only signing secret and is git-ignored; it can remain across local storage resets.
- To reset browser-side state, clear the site data for `localhost:3001`.

## Local service behavior

- D1 uses the `xpass-local` binding; KV and R2 use Wrangler's local emulator and the same `.wrangler/local` persistence directory.
- Local email sending has no configured outbound provider. Internal app flows can be previewed, but the environment does not send real mail. Inbound email and OAuth providers are not connected.
- The test login is recreated by `init:local`; its password is random and is not stored in tracked files.
- The existing Worker initializer (`/api/init/:secret`) applies the schema on the local D1 database. `init:local` calls that endpoint and then seeds only the local test account and sample message.

## Troubleshooting

- **Port 8787 is already in use:** stop the other process using it, then restart Wrangler.
- **Database initialization cannot connect:** confirm the Worker is running at `127.0.0.1:8787`, then rerun `pnpm --dir mail-worker init:local`.
- **Missing `.dev.vars` or JWT secret:** rerun `pnpm --dir mail-worker setup:local`, then restart Wrangler before initializing.
- **Worker cannot find `mail-vue/dist`:** run `pnpm --dir mail-vue build` again.
- **Frontend network errors:** verify `.env.dev` sets `VITE_BASE_URL = 'http://127.0.0.1:8787/api'` and both servers are running.
- **Wrangler `Request.cf` fallback warning:** if the optional metadata lookup times out, wait for Wrangler's `Ready on http://127.0.0.1:8787` message; the Worker remains local.
- **Vite `504 (Outdated Optimize Dep)` on first load:** wait for dependency optimization to finish, then reload the page.
- **Stale login after resetting storage:** clear the browser's site data for `localhost:3001` and initialize the local account again.

Never use `wrangler deploy`, the `test` package script, or `--remote` for this setup.

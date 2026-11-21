# Optional Bulwark Lite webmail (static assets only)

Companion for viewing mirrored mail. It stays opt-in: the asset-only Worker has
no script and is published on **`https://jmap.<DOMAIN>`** as a Custom Domain.
Cloudflare creates that DNS record and certificate automatically, so `jmap`
must not already have a CNAME. No tunnel route is created and JMAP itself still
goes to `https://jadmin.<DOMAIN>`.

Full settings reference, CORS step and rollback instructions:
[`../README.md` §9](../README.md#9-optional-webmail-bulwark-lite-static-assets-only).

Quick start (manual):

```sh
cd webmail
DOMAIN=<DOMAIN> ./deploy.sh
# review dist/config.json, dist/_headers and wrangler.deploy.toml
DOMAIN=<DOMAIN> ./deploy.sh --deploy
```

`config.example.json` pins `jmapServerUrl` to `https://jadmin.<DOMAIN>`;
`wrangler.toml` is asset-only with no `main` and no route for local dev.
`deploy.sh` renders `wrangler-action.toml` into a gitignored
`wrangler.deploy.toml` with the `jmap.<DOMAIN>` Custom Domain and always passes
`--name`, so it cannot overwrite an unrelated Worker. `dist/`, `config.json`,
`*.zip` and `wrangler.deploy.toml` are gitignored — the pinned upstream zip is
downloaded and SHA-256 verified. Set `WEBMAIL_WORKER_NAME=<unique-name>` if the
default name is taken. The CSP `connect-src` is pinned to the single JMAP
origin.

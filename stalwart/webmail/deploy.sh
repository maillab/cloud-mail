#!/usr/bin/env bash
# Prepare/deploy the OPTIONAL Bulwark Lite webmail static assets.
# The asset-only Worker is published on jmap.<DOMAIN> as a Custom Domain; there
# is still no Worker script. Run it by hand or through the pinned
# deploy-stalwart Action in this repo.
#
#   DOMAIN=example.com ./deploy.sh              # prepare dist/ only
#   DOMAIN=example.com ./deploy.sh --deploy     # prepare, then wrangler deploy
#
# Pin the release and its hash here; update both together when upgrading.
set -euo pipefail

VERSION="${BULWARK_LITE_VERSION:-1.21.3}"
SHA256="${BULWARK_LITE_SHA256:-3cbccac8d9b37104829e884be8c28814a1b095ca089e068168ed456d9cca0c6b}"
ASSET="bulwark-lite-${VERSION}.zip"
URL="https://github.com/bulwarkmail/webmail/releases/download/${VERSION}/${ASSET}"
# Override if this account already has a Worker of the default name. The CLI
# --name takes precedence over wrangler.toml so we never clobber a different app.
WORKER_NAME="${WEBMAIL_WORKER_NAME:-cloud-stalwart-webmail}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

DO_DEPLOY=0
for arg in "$@"; do
  case "$arg" in
    --deploy) DO_DEPLOY=1 ;;
    *) printf 'Unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

: "${DOMAIN:?Set DOMAIN to the base domain, e.g. DOMAIN=example.com}"
DOMAIN="${DOMAIN#.}" # accept a leading dot from copied DNS values
# Strict hostname validation: no scheme, path, query, shell metacharacters or
# sed replacement characters (| & /). Prevents a malformed jmapServerUrl and
# keeps the config render injection-free.
if [[ ! "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] \
   || [[ "$DOMAIN" == *..* ]] || [[ "$DOMAIN" != *.* ]]; then
  printf 'Invalid DOMAIN: %s (expected e.g. example.com)\n' "$DOMAIN" >&2
  exit 2
fi
if [[ ! "$WORKER_NAME" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  printf 'Invalid WEBMAIL_WORKER_NAME: %s\n' "$WORKER_NAME" >&2
  exit 2
fi
# The webmail UI is served here; JMAP itself still lives at https://jadmin.<DOMAIN>.
WEBMAIL_HOST="jmap.${DOMAIN}"

# --- download + verify -------------------------------------------------------
if [[ ! -f "$ASSET" ]]; then
  printf 'Downloading %s\n' "$URL"
  curl -fsSL --retry 3 -o "$ASSET" "$URL"
fi
ACTUAL="$(sha256sum "$ASSET" | awk '{print $1}')"
if [[ "$ACTUAL" != "$SHA256" ]]; then
  printf 'SHA-256 mismatch for %s\n  expected %s\n  actual   %s\n' "$ASSET" "$SHA256" "$ACTUAL" >&2
  exit 1
fi
printf 'Verified %s (%s)\n' "$ASSET" "$ACTUAL"

# --- unpack + render config --------------------------------------------------
rm -rf dist
mkdir -p dist
if command -v unzip >/dev/null 2>&1; then
  unzip -q "$ASSET" -d dist
else
  python3 -m zipfile -e "$ASSET" dist
fi

if [[ ! -f dist/index.html ]]; then
  printf 'Archive did not contain index.html at its root\n' >&2
  exit 1
fi

sed "s|example.com|${DOMAIN}|g" config.example.json > dist/config.json
python3 - "$DOMAIN" <<'PY'
import json, pathlib, sys
domain = sys.argv[1]
# Fail fast if the render produced invalid JSON or pointed at the wrong origin.
config = json.loads(pathlib.Path('dist/config.json').read_text())
expected = f'https://jadmin.{domain}'
if config.get('jmapServerUrl') != expected:
    raise SystemExit(f'unexpected jmapServerUrl: {config.get("jmapServerUrl")}')
if config.get('allowCustomJmapEndpoint') is not False or config.get('noThirdPartyTraffic') is not True:
    raise SystemExit('unsafe config: check allowCustomJmapEndpoint / noThirdPartyTraffic')

# The stock release ships "connect-src 'self' *". Pin it to the single JMAP
# backend so a compromised page cannot open sockets to arbitrary hosts.
headers = pathlib.Path('dist/_headers')
if headers.exists():
    text = headers.read_text()
    widened = "connect-src 'self' *"
    if widened in text:
        text = text.replace(widened, f"connect-src 'self' {expected}")
        headers.write_text(text)
        print(f'Pinned CSP connect-src to {expected}')
PY
printf 'Wrote and verified dist/config.json (jmapServerUrl=%s)\n' "https://jadmin.$DOMAIN"
printf 'Review it before deploying: %s\n' "$DIR/dist/config.json"

# --- optional deploy ---------------------------------------------------------
if [[ ! -f wrangler-action.toml ]]; then
  printf 'wrangler-action.toml is missing\n' >&2
  exit 1
fi
sed "s|\${WEBMAIL_HOST}|${WEBMAIL_HOST}|g" wrangler-action.toml > wrangler.deploy.toml
printf 'Rendered Custom Domain: https://%s\n' "$WEBMAIL_HOST"

if [[ "$DO_DEPLOY" -eq 0 ]]; then
  printf '\nPrepared only. To deploy, run from %s:\n' "$DIR"
  printf '  ../node_modules/.bin/wrangler deploy -c wrangler.deploy.toml --name %s\n' "$WORKER_NAME"
  exit 0
fi

if [[ ! -x ../node_modules/.bin/wrangler ]]; then
  printf 'wrangler not found; run npm install in ../ first\n' >&2
  exit 1
fi
../node_modules/.bin/wrangler deploy -c wrangler.deploy.toml --name "$WORKER_NAME"

printf '\nDeployed asset-only Worker "%s" on https://%s (no Worker script).\n' "$WORKER_NAME" "$WEBMAIL_HOST"
printf 'Cloudflare creates the DNS record and certificate; jmap must not already\n'
printf 'have a CNAME. JMAP itself stays at https://jadmin.%s. Before signing in,\n' "$DOMAIN"
printf 'make sure Stalwart allows the webmail origin (usePermissiveCors=true), then\n'
printf 'log in with a normal Stalwart user account - never the narrow mirror API key.\n'

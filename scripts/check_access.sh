#!/usr/bin/env bash
# Refuse to deploy plan content unless the Worker is configured for Cloudflare Access.
set -euo pipefail
cd "$(dirname "$0")/../app"
[ -f wrangler.jsonc ] || { echo "app/wrangler.jsonc missing - run make setup"; exit 1; }
if grep -qE '"ACCESS_(TEAM_DOMAIN|AUD)": ""' wrangler.jsonc || grep -q REPLACE_WITH wrangler.jsonc; then
  echo "Refusing to deploy: set ACCESS_TEAM_DOMAIN, ACCESS_AUD and the KV id in app/wrangler.jsonc first."
  echo "Your plans would otherwise be publicly downloadable. See README > Cloudflare Access."
  exit 1
fi

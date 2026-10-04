#!/usr/bin/env bash
# One-time setup: Python venv, npm packages, config files, Cloudflare KV namespace.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Python environment"
python3 -m venv .venv
.venv/bin/pip install -q -r pipeline/requirements.txt

echo "==> App dependencies"
(cd app && npm install --silent)

[ -f plans.config.json ] || { cp plans.config.example.json plans.config.json; echo "==> Created plans.config.json (edit for your model)"; }
mkdir -p plans enrich

if [ ! -f app/wrangler.jsonc ]; then
  read -rp "Worker name (your site will be <name>.<subdomain>.workers.dev) [rv-plans]: " NAME
  NAME=${NAME:-rv-plans}
  (cd app && (npx wrangler whoami >/dev/null 2>&1 || npx wrangler login))
  echo "==> Creating KV namespace for chat history"
  ID=$(cd app && npx wrangler kv namespace create "${NAME}-chats" 2>&1 | grep -oE '"id": "[0-9a-f]{32}"' | grep -oE '[0-9a-f]{32}' || true)
  if [ -z "$ID" ]; then
    echo "Could not create the KV namespace; create one in the dashboard and put its id in app/wrangler.jsonc"; ID=REPLACE_WITH_KV_ID
  fi
  sed -e "s/\"name\": \"rv-plans\"/\"name\": \"$NAME\"/" -e "s/REPLACE_WITH_KV_ID/$ID/" app/wrangler.example.jsonc > app/wrangler.jsonc
  echo "==> Wrote app/wrangler.jsonc"
fi

cat <<'MSG'

Setup done. Next:
  1. Put your plan PDFs in plans/ and check plans.config.json.
  2. Add ANTHROPIC_API_KEY=sk-ant-... to .env (a workspace-scoped key).
  3. make placeholder   - create the Worker with a locked placeholder
  4. Enable Cloudflare Access on it and fill ACCESS_TEAM_DOMAIN / ACCESS_AUD in app/wrangler.jsonc (see README)
  5. cd app && npx wrangler secret put ANTHROPIC_API_KEY
  6. make extract && make enrich-batch && make deploy
MSG

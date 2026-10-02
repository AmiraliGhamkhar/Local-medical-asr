#!/bin/sh
# Verify the Convex backend end to end in a single, self-contained run.
#
# The backend is booted, the functions are pushed, the integration suite runs
# against the live deployment, and everything is torn down again. Everything
# happens inside this one script so no long-lived process is left behind.
#
# Usage: sh ./scripts/verify-backend.sh
set -eu

ROOT="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

PORT="${CONVEX_TEST_PORT:-3210}"
DB="$(mktemp -u)/convex-verify.sqlite3"
SECRET_FILE="$(mktemp -u)/convex-secret"
ADMIN_FILE="$(mktemp -u)/convex-admin"

cleanup() {
  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

mkdir -p "$(dirname -- "$DB")" "$(dirname -- "$SECRET_FILE")" "$(dirname -- "$ADMIN_FILE")"

# Locate the Convex local backend binary the CLI already downloaded.
BIN="$(find "$HOME/.cache/convex/binaries" -name convex-local-backend -type f 2>/dev/null | head -n 1)"
if [ -z "$BIN" ]; then
  echo "convex-local-backend not found; run 'bunx convex dev --once' once to download it." >&2
  exit 1
fi

SECRET="$(bun -e 'console.log(crypto.getRandomValues(new Uint8Array(32)).reduce((s,b)=>s+b.toString(16).padStart(2,"0"),""))')"
printf '%s' "$SECRET" > "$SECRET_FILE"

"$BIN" keygen admin-key --instance-name dev --instance-secret "$SECRET" > "$ADMIN_FILE"

echo "==> starting local Convex backend on port $PORT"
"$BIN" "$DB" \
  --port "$PORT" \
  --site-proxy-port "$((PORT + 1))" \
  --instance-name dev \
  --instance-secret "$SECRET" \
  --disable-beacon > /tmp/convex-verify.log 2>&1 &
BACKEND_PID=$!

# Wait for readiness rather than sleeping a fixed amount.
i=0
until curl -sf "http://127.0.0.1:$PORT/version" > /dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "backend did not become ready" >&2
    tail -n 40 /tmp/convex-verify.log >&2
    exit 1
  fi
  sleep 0.5
done
echo "==> backend ready"

echo "==> pushing functions"
# `--env-file` replaces .env.local entirely, so the local-deployment setting
# written at project setup cannot conflict with self-hosted mode.
ENV_FILE="$(mktemp -u)/convex-env"
mkdir -p "$(dirname -- "$ENV_FILE")"
cat > "$ENV_FILE" <<ENVFILE
CONVEX_SELF_HOSTED=1
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:$PORT
CONVEX_SELF_HOSTED_ADMIN_KEY=$(cat "$ADMIN_FILE")
ENVFILE

bunx convex dev --once --typecheck disable --env-file "$ENV_FILE" > /tmp/convex-push.log 2>&1 || {
  echo "function push failed" >&2
  tail -n 40 /tmp/convex-push.log >&2
  exit 1
}
echo "==> functions pushed"

echo "==> running backend integration suite"
CONVEX_TEST_URL="http://127.0.0.1:$PORT" bunx vitest run src/convex/backend.integration.test.ts

echo "==> backend verification complete"
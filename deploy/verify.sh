#!/usr/bin/env bash
# Verifies a served Nawara Admin build (the CI image smoke test and the post-deploy live check):
#   bash deploy/verify.sh <base-url> <expected-commit-sha>
# Deployed commit, deep links, caching, security headers, missing assets, and that no demo account, demo credential,
# mock adapter or simulated passkey is reachable in any JavaScript the application can load.
set -euo pipefail
BASE="${1:?base URL}"; SHA="${2:?expected commit}"
fail() { printf 'verify: FAIL %s\n' "$*" >&2; exit 1; }
ok() { printf 'verify: ok   %s\n' "$*"; }
header() { curl -fsSI "$BASE$1" | tr -d '\r' | grep -i "^$2:" | cut -d' ' -f2- || true; }

[ "$(curl -fsS "$BASE/version.txt")" = "$SHA" ] || fail "deployed commit is not $SHA"; ok "commit $SHA"
[ "$(curl -fsS "$BASE/healthz")" = ok ] || fail "/healthz"; ok "/healthz"

for path in / /login /login/verify /overview /platforms /session-unavailable; do
  body=$(curl -fsS "$BASE$path") || fail "$path is not 200"
  grep -q '<adm-root' <<<"$body" || fail "$path does not serve the application shell"
done
ok "deep links serve the application shell"
[ "$(header /login Cache-Control)" = no-cache ] || fail "the shell must be revalidated (Cache-Control: no-cache)"
[ "$(header / X-Content-Type-Options)" = nosniff ] || fail "X-Content-Type-Options"
[ "$(header / X-Frame-Options)" = DENY ] || fail "X-Frame-Options"
ok "shell caching and security headers"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/brand/does-not-exist.png")
[ "$code" = 404 ] || fail "a missing asset must be 404, got $code"
[ -z "$(curl -sI "$BASE/main-DOESNOTEXIST.js" | tr -d '\r' | grep -i '^cache-control: .*immutable')" ] \
  || fail "a 404 must never be cached as immutable"
ok "missing assets are 404 and not cached"

index=$(curl -fsS "$BASE/")
main=$(grep -o 'main-[A-Za-z0-9_-]*\.js' <<<"$index" | head -n 1); [ -n "$main" ] || fail "main bundle not referenced"
grep -qi 'immutable' <<<"$(header "/$main" Cache-Control)" || fail "hashed bundles must be immutable"
for css in $(grep -o 'styles-[A-Za-z0-9_-]*\.css' <<<"$index" | sort -u); do curl -fsS -o /dev/null "$BASE/$css" || fail "$css"; done
ok "bundles load and are cached as immutable"

# Every JavaScript file reachable from main (lazy chunks included), scanned for demo-only content.
MARKERS='demo\.nawara\.invalid|nawara-demo-2026|simulated-passkey|DEMO_LATENCY_MS|COMPANY_OVERVIEW_DEMO_SCENARIO'
declare -A seen=(); queue=("$main"); count=0
while [ ${#queue[@]} -gt 0 ]; do
  file="${queue[0]}"; queue=("${queue[@]:1}")
  [ -n "${seen[$file]:-}" ] && continue; seen[$file]=1; count=$((count + 1))
  js=$(curl -fsS "$BASE/$file") || fail "$file referenced but not served"
  if grep -qE "$MARKERS" <<<"$js"; then fail "$file contains demo-only content"; fi
  for next in $(grep -oE '(chunk|main|polyfills)-[A-Za-z0-9_-]{8}\.js' <<<"$js" | sort -u); do queue+=("$next"); done
done
ok "$count JavaScript files: no demo account, credential, mock adapter or simulated passkey"

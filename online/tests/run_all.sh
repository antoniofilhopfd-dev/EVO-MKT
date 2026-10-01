#!/bin/bash
# Roda API + UI contra um site recém-instalado (DB=mysql para MySQL). Requer php, node e Playwright.
HERE=$(cd "$(dirname "$0")" && pwd); D=${EVO_TEST_DIR:-/tmp/evo-test}; PIDF=$D.pid; rc=0
for suite in api ui; do
  [ -f "$PIDF" ] && kill "$(cat $PIDF)" 2>/dev/null && sleep 0.5
  "$HERE/setup.sh" "$D" >/dev/null || exit 2
  (cd "$D" && exec php -S 127.0.0.1:8080 -t . tests/router.php >"$D/php.log" 2>&1) & echo $! > "$PIDF"; sleep 1
  echo "=== $suite ==="; node "$HERE/$suite.test.js" "$D/install.out" || rc=1
done
kill "$(cat $PIDF)" 2>/dev/null; exit $rc

#!/bin/bash
# Roda API + UI contra um site recém-instalado (DB=mysql para MySQL). Requer php, node e Playwright.
HERE=$(cd "$(dirname "$0")" && pwd); D=${EVO_TEST_DIR:-/tmp/evo-test}; PIDF=$D.pid; rc=0
for suite in api ui ui2; do
  [ -f "$PIDF" ] && kill "$(cat $PIDF)" 2>/dev/null && sleep 0.5
  "$HERE/setup.sh" "$D" >/dev/null || exit 2
  (cd "$D" && exec php -S 127.0.0.1:8080 -t . tests/router.php >"$D/php.log" 2>&1) & echo $! > "$PIDF"; sleep 1
  echo "=== $suite ==="; MAILLOG="$D/storage/mail.log" node "$HERE/$suite.test.js" "$D/install.out" || rc=1
  if [ "$suite" = "api" ]; then echo "=== cron_alertas ==="; php "$D/cron_alertas.php" && grep -q "Resumo de prazos" "$D/storage/mail.log" && grep -q "Seus prazos de hoje" "$D/storage/mail.log" && echo "OK   cron envia resumo da Gerente e prazos por pessoa" || { echo "FAIL cron_alertas"; rc=1; }; fi
done
kill "$(cat $PIDF)" 2>/dev/null; exit $rc

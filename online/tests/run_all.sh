#!/bin/bash
# Roda API + UI contra um site recém-instalado (DB=mysql para MySQL). Requer php, node e Playwright.
HERE=$(cd "$(dirname "$0")" && pwd); D=${EVO_TEST_DIR:-/tmp/evo-test}; PIDF=$D.pid; rc=0
[ -f /tmp/evo-mock.pid ] && kill "$(cat /tmp/evo-mock.pid)" 2>/dev/null
(exec php -S 127.0.0.1:8099 "$HERE/mock_apis.php" >/dev/null 2>&1) & echo $! > /tmp/evo-mock.pid; sleep 1
for suite in api integrations ui ui2 ui3; do
  [ -f "$PIDF" ] && kill "$(cat $PIDF)" 2>/dev/null && sleep 0.5
  "$HERE/setup.sh" "$D" >/dev/null || exit 2
  (cd "$D" && PHP_CLI_SERVER_WORKERS=4 exec php -S 127.0.0.1:8080 -t . tests/router.php >"$D/php.log" 2>&1) & echo $! > "$PIDF"; sleep 1
  echo "=== $suite ==="; EVO_DIR="$D" MAILLOG="$D/storage/mail.log" node "$HERE/$suite.test.js" "$D/install.out" || rc=1
  if [ "$suite" = "api" ]; then echo "=== diagnostico ==="; php "$D/diagnostico.php" chave-de-teste-123 | grep -q "RESULTADO" && ! php "$D/diagnostico.php" chave-errada | grep -q "RESULTADO" && echo "OK   diagnostico.php roda com a chave e recusa chave errada" || { echo "FAIL diagnostico"; rc=1; }; echo "=== cron_alertas ==="; php "$D/cron_alertas.php" && grep -q "Resumo de prazos" "$D/storage/mail.log" && grep -q "Seus prazos de hoje" "$D/storage/mail.log" && echo "OK   cron envia resumo da Gerente e prazos por pessoa" || { echo "FAIL cron_alertas"; rc=1; }; fi
done
kill "$(cat $PIDF)" 2>/dev/null; kill "$(cat /tmp/evo-mock.pid)" 2>/dev/null; exit $rc

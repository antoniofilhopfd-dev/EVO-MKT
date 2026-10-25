#!/bin/bash
# Sobe o app Next.js (build de produção) contra um MySQL/MariaDB local e roda as suítes HTTP/UI do projeto.
#   ./run-web.sh [suite...]      suítes: veja SUITES abaixo. SKIP_BUILD=1 reaproveita o build já feito.
set -u
HERE=$(cd "$(dirname "$0")" && pwd); WEB=$(cd "$HERE/.." && pwd); T="$HERE"
D=${EVO_TEST_DIR:-/tmp/evo-web-test}; mkdir -p "$D"; PORT=${PORT:-8080}
FALHOU=''
SUITES=${*:-api acesso codigo recover integrations instagram contas backup integridade notificacoes conteudo fluxo removidos trafego cinco calendario-geral instagram6 prints-instagram instagram-auditoria filtros-abas migracoes escolar datacom auditoria seguranca-estatica seguranca contraste responsive desempenho insights}; rc=0
mariadb -uroot -S /run/mysqld/mysqld.sock -e "select 1" >/dev/null 2>&1 || { (mysqld_safe --user=mysql >/dev/null 2>&1 &); for i in $(seq 30); do mariadb -uroot -S /run/mysqld/mysqld.sock -e "select 1" >/dev/null 2>&1 && break; sleep 1; done; }
mariadb -uroot -S /run/mysqld/mysqld.sock -e "CREATE USER IF NOT EXISTS 'evo'@'127.0.0.1' IDENTIFIED BY 'evopass'; GRANT ALL ON *.* TO 'evo'@'127.0.0.1';" 2>/dev/null
[ -n "${SKIP_BUILD:-}" ] || (cd "$WEB" && npm run build >"$D/build.log" 2>&1) || { echo "build falhou (ver $D/build.log)"; exit 2; }
export DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=evowebtest DB_USER=evo DB_PASSWORD=evopass NODE_ENV=production
export SESSION_SECRET=segredo-de-teste-sessao-0123456789abcdef APP_KEY=chave-app-de-teste-0123456789 SETUP_KEY=chave-setup-de-teste-123 RECOVERY_KEY=recuperacao-de-teste-0123456789 PUBLIC_URL=http://127.0.0.1:$PORT
export NOTIFY_TO=gerente@teste.com MAIL_LOG="$D/mail.log" LOGIN_GLOBAL_MAX=12 LOGIN_IP_MAX=30 LOGIN_DELAY_MS=0 CRON_SECRET=cron-de-teste-0123456789 TIMEZONE=America/Fortaleza ANTHROPIC_API_BASE=http://127.0.0.1:8099/anthropic
export META_GRAPH_BASE=http://127.0.0.1:8099/graph META_OAUTH_BASE=http://127.0.0.1:8099/graph/dialog/oauth GOOGLE_AUTH_URL=http://127.0.0.1:8099/google/auth GOOGLE_TOKEN_URL=http://127.0.0.1:8099/google/token GOOGLE_API_BASE=http://127.0.0.1:8099/google GOOGLE_SHEETS_BASE=http://127.0.0.1:8099/google IG_POLL_MS=300
# a suíte de integrações chama "php cron_integracoes.php <tarefa>": aqui o atalho chama o endpoint de cron do app Next
cat > "$D/cron_integracoes.php" <<PHP
<?php
\$t = \$argv[1] ?? 'tudo';
\$ch = curl_init("http://127.0.0.1:$PORT/api/cron/integracoes?tarefa=" . \$t);
curl_setopt_array(\$ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . getenv('CRON_SECRET')], CURLOPT_TIMEOUT => 120]);
echo curl_exec(\$ch);
PHP
[ -f /tmp/evo-mock.pid ] && kill "$(cat /tmp/evo-mock.pid)" 2>/dev/null
(exec php -S 127.0.0.1:8099 "$T/mock_apis.php" >/dev/null 2>&1) & echo $! > /tmp/evo-mock.pid; sleep 1
stop(){ for p in $(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -o 'pid=[0-9]*' | cut -d= -f2); do kill $p 2>/dev/null; done; sleep 0.7; }
for suite in $SUITES; do
  stop
  mariadb -uroot -S /run/mysqld/mysqld.sock -e "DROP DATABASE IF EXISTS evowebtest; CREATE DATABASE evowebtest CHARACTER SET utf8mb4;"
  rm -f "$D/mail.log"
  curl -s http://127.0.0.1:8099/__reset >/dev/null 2>&1 # simulador da Meta/Google zerado: cada suíte começa do mesmo ponto
  (cd "$WEB" && exec npx next start -p $PORT >"$D/next.log" 2>&1) & 
  for i in $(seq 40); do curl -fsS "http://127.0.0.1:$PORT/api/heartbeat" >/dev/null 2>&1 && break; sleep 0.5; done
  curl -fsS "http://127.0.0.1:$PORT/api/setup?key=$SETUP_KEY" > "$D/install.out"
  echo "=== $suite ==="
  BASE=http://127.0.0.1:$PORT EVO_DIR="$D" MAILLOG="$D/mail.log" node "$([ -f "$HERE/$suite.test.js" ] && echo "$HERE" || echo "$T")/$suite.test.js" "$D/install.out" || { rc=1; FALHOU="$FALHOU $suite"; }
  if [ "$suite" = "api" ]; then
    echo "=== cron ==="
    c401=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/cron/alertas"); c401b=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer errado" "http://127.0.0.1:$PORT/api/cron/alertas")
    c200=$(curl -s -o "$D/cron.out" -w '%{http_code}' -H "Authorization: Bearer $CRON_SECRET" "http://127.0.0.1:$PORT/api/cron/alertas")
    if [ "$c401" = 401 ] && [ "$c401b" = 401 ] && [ "$c200" = 200 ] && grep -q "Resumo de prazos" "$D/mail.log" && grep -q "Seus prazos de hoje" "$D/mail.log"; then echo "OK   cron/alertas: 401 sem/errado, 200 com Bearer, envia resumo da Gerente e prazos por pessoa"; else echo "FAIL cron/alertas ($c401/$c401b/$c200) $(cat "$D/cron.out")"; rc=1; fi
  fi
done
stop; kill "$(cat /tmp/evo-mock.pid)" 2>/dev/null
if [ -n "$FALHOU" ]; then echo "SUÍTES COM FALHA:$FALHOU"; else echo "TODAS AS SUÍTES PASSARAM"; fi
exit $rc

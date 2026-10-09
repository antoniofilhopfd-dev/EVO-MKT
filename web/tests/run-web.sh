#!/bin/bash
# Sobe o app Next.js (build de produção) contra um MySQL/MariaDB local e roda as suítes HTTP/UI do projeto.
#   ./run-web.sh [suite...]      suítes: api acesso ui ui2 ui4 (padrão: todas as compatíveis)
set -u
HERE=$(cd "$(dirname "$0")" && pwd); WEB=$(cd "$HERE/.." && pwd); T="$WEB/../online/tests"
D=${EVO_TEST_DIR:-/tmp/evo-web-test}; mkdir -p "$D"; PORT=${PORT:-8080}
SUITES=${*:-api acesso ui ui2 ui4}; rc=0
mariadb -uroot -S /run/mysqld/mysqld.sock -e "select 1" >/dev/null 2>&1 || { (mysqld_safe --user=mysql >/dev/null 2>&1 &); for i in $(seq 30); do mariadb -uroot -S /run/mysqld/mysqld.sock -e "select 1" >/dev/null 2>&1 && break; sleep 1; done; }
mariadb -uroot -S /run/mysqld/mysqld.sock -e "CREATE USER IF NOT EXISTS 'evo'@'127.0.0.1' IDENTIFIED BY 'evopass'; GRANT ALL ON *.* TO 'evo'@'127.0.0.1';" 2>/dev/null
(cd "$WEB" && npm run build >"$D/build.log" 2>&1) || { echo "build falhou (ver $D/build.log)"; exit 2; }
export DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=evowebtest DB_USER=evo DB_PASSWORD=evopass NODE_ENV=production
export SESSION_SECRET=segredo-de-teste-sessao-0123456789abcdef APP_KEY=chave-app-de-teste-0123456789 SETUP_KEY=chave-setup-de-teste-123 PUBLIC_URL=http://127.0.0.1:$PORT
export NOTIFY_TO=gerente@teste.com MAIL_LOG="$D/mail.log" LOGIN_GLOBAL_MAX=12 LOGIN_IP_MAX=30 LOGIN_DELAY_MS=0 CRON_SECRET=cron-de-teste-0123456789 TIMEZONE=America/Recife
stop(){ for p in $(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -o 'pid=[0-9]*' | cut -d= -f2); do kill $p 2>/dev/null; done; sleep 0.7; }
for suite in $SUITES; do
  stop
  mariadb -uroot -S /run/mysqld/mysqld.sock -e "DROP DATABASE IF EXISTS evowebtest; CREATE DATABASE evowebtest CHARACTER SET utf8mb4;"
  rm -f "$D/mail.log"
  (cd "$WEB" && exec npx next start -p $PORT >"$D/next.log" 2>&1) & 
  for i in $(seq 40); do curl -fsS "http://127.0.0.1:$PORT/api/heartbeat" >/dev/null 2>&1 && break; sleep 0.5; done
  curl -fsS "http://127.0.0.1:$PORT/api/setup?key=$SETUP_KEY" > "$D/install.out"
  # registro "importado" que a suíte api espera (TAR-0007 com acentos), como no teste da versão PHP
  mariadb --default-character-set=utf8mb4 -uroot -S /run/mysqld/mysqld.sock evowebtest -e "
    INSERT INTO used_ids(id) VALUES('TAR-0007'); INSERT INTO id_counters(modulo,n) VALUES('tarefas',7);
    INSERT INTO records(modulo,id,data,criado_em,atualizado_em) VALUES('tarefas','TAR-0007','{\"id\":\"TAR-0007\",\"titulo\":\"Tarefa importada\",\"status\":\"NOVO\",\"prioridade\":\"ALTA\",\"responsavel\":\"Antônio Filho\",\"segmento\":\"Infantil\",\"descricao\":\"Descrição ç ã\",\"criadoEm\":\"2026-09-01T10:00:00-03:00\",\"atualizadoEm\":\"2026-09-01T10:00:00-03:00\"}','2026-09-01T10:00:00-03:00','2026-09-01T10:00:00-03:00');"
  echo "=== $suite ==="
  BASE=http://127.0.0.1:$PORT EVO_DIR="$D" MAILLOG="$D/mail.log" node "$T/$suite.test.js" "$D/install.out" || rc=1
done
stop; exit $rc

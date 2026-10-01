#!/bin/bash
# Monta um site de teste isolado em $1 (padrão /tmp/evo-test) com SQLite OU MySQL e instala.
#   ./setup.sh /tmp/evo-test            → SQLite
#   DB=mysql ./setup.sh /tmp/evo-test   → MySQL (DB evotest, user evo/evopass em 127.0.0.1)
set -e
D=${1:-/tmp/evo-test}; HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/.." && pwd); REPO=$(cd "$ROOT/.." && pwd)
mkdir -p "$D" && cp -r "$ROOT"/. "$D"/ && rm -f "$D/config.php" "$D/storage/installed.lock" "$D/storage/evo.sqlite"
if [ "$DB" = "mysql" ]; then
cat > "$D/config.php" <<C
<?php return ['db'=>['driver'=>'mysql','host'=>'127.0.0.1','name'=>'evotest','user'=>'evo','pass'=>'evopass'],'install_key'=>'chave-de-teste-123','timezone'=>'America/Recife','session_hours'=>12,'max_upload_mb'=>20,'backup_keep'=>30,'notify_to'=>'gerente@teste.com','login_global_max'=>12,'login_ip_max'=>30,'login_delay_ms'=>0,'mail_log'=>__DIR__.'/storage/mail.log','app_key'=>'chave-app-de-teste-0123456789','public_url'=>'http://127.0.0.1:8080','meta_graph_base'=>'http://127.0.0.1:8099/graph','meta_oauth_base'=>'http://127.0.0.1:8099/graph/dialog/oauth','google_auth_url'=>'http://127.0.0.1:8099/google/auth','google_token_url'=>'http://127.0.0.1:8099/google/token','google_api_base'=>'http://127.0.0.1:8099/google','google_sheets_base'=>'http://127.0.0.1:8099/google'];
C
mariadb -uroot -S /run/mysqld/mysqld.sock -e "DROP DATABASE IF EXISTS evotest; CREATE DATABASE evotest CHARACTER SET utf8mb4;" || mysql -uroot -e "DROP DATABASE IF EXISTS evotest; CREATE DATABASE evotest CHARACTER SET utf8mb4;"
else
cat > "$D/config.php" <<C
<?php return ['db'=>['driver'=>'sqlite','path'=>__DIR__.'/storage/evo.sqlite'],'install_key'=>'chave-de-teste-123','timezone'=>'America/Recife','session_hours'=>12,'max_upload_mb'=>20,'backup_keep'=>30,'notify_to'=>'gerente@teste.com','login_global_max'=>12,'login_ip_max'=>30,'login_delay_ms'=>0,'mail_log'=>__DIR__.'/storage/mail.log','app_key'=>'chave-app-de-teste-0123456789','public_url'=>'http://127.0.0.1:8080','meta_graph_base'=>'http://127.0.0.1:8099/graph','meta_oauth_base'=>'http://127.0.0.1:8099/graph/dialog/oauth','google_auth_url'=>'http://127.0.0.1:8099/google/auth','google_token_url'=>'http://127.0.0.1:8099/google/token','google_api_base'=>'http://127.0.0.1:8099/google','google_sheets_base'=>'http://127.0.0.1:8099/google'];
C
fi
mkdir -p "$D/storage/import" && cp -r "$REPO/DADOS" "$D/storage/import/DADOS"
python3 - "$D" <<'PY' 2>/dev/null || true
import sys,openpyxl
f=sys.argv[1]+'/storage/import/DADOS/EVO_MKT_TAREFAS.xlsx'
wb=openpyxl.load_workbook(f);ws=wb.worksheets[0]
ws.append(['TAR-0007','Tarefa importada','NOVO','ALTA','Antônio Filho','Infantil','','','Descrição ç ã','','','','','2026-09-01T10:00:00-03:00','2026-09-01T10:00:00-03:00'])
wb.save(f)
PY
php "$D/install.php" chave-de-teste-123 > "$D/install.out" 2>&1
echo "Instalado em $D (senhas em $D/install.out). Suba: cd $D && php -S 127.0.0.1:8080 -t . tests/router.php"

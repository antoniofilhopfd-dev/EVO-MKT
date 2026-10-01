<?php
declare(strict_types=1);
/**
 * Diagnóstico de instalação — confere se o servidor está pronto para o EVO MKT.
 *  Navegador: https://SEU-DOMINIO/diagnostico.php?key=SUA_INSTALL_KEY      (depois de criar o config.php)
 *  Terminal : php diagnostico.php SUA_INSTALL_KEY
 * Não altera nada. APAGUE este arquivo depois que tudo estiver [OK].
 */
$cli = PHP_SAPI === 'cli';
if (!$cli) {
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
}
$res = ['ok' => 0, 'aviso' => 0, 'erro' => 0];
function linha(string $nivel, string $msg): void
{
    global $res;
    $tag = ['ok' => '[ OK ]', 'aviso' => '[ATENÇÃO]', 'erro' => '[ ERRO ]', 'info' => '[ info ]'][$nivel];
    if (isset($res[$nivel])) {
        $res[$nivel]++;
    }
    echo $tag . ' ' . $msg . "\n";
}
function titulo(string $t): void
{
    echo "\n== $t ==\n";
}
echo "DIAGNÓSTICO DO EVO MKT — " . date('d/m/Y H:i') . "\n";

// ---- servidor (não depende do config) ----
titulo('Servidor');
version_compare(PHP_VERSION, '8.1.0', '>=') ? linha('ok', 'PHP ' . PHP_VERSION . (version_compare(PHP_VERSION, '8.2.0', '>=') ? '' : ' (funciona; 8.2 ou superior é o recomendado)')) : linha('erro', 'PHP ' . PHP_VERSION . ' é antigo. No hPanel → Avançado → Configuração do PHP, escolha 8.2 ou superior.');
foreach (['pdo' => 'banco de dados', 'pdo_mysql' => 'MySQL', 'curl' => 'integrações Instagram/Google', 'openssl' => 'criptografia dos tokens', 'mbstring' => 'textos com acento', 'json' => 'JSON', 'zip' => 'importar os XLSX', 'simplexml' => 'importar os XLSX', 'fileinfo' => 'envio ao Drive'] as $ext => $para) {
    extension_loaded($ext) ? linha('ok', "extensão $ext") : linha($ext === 'pdo_mysql' || $ext === 'pdo' || $ext === 'openssl' || $ext === 'mbstring' ? 'erro' : 'aviso', "extensão $ext ausente (usada para: $para). Ative em hPanel → Avançado → Configuração do PHP → Extensões.");
}
$ini = fn(string $k) => (string)ini_get($k);
$mb = function (string $v): float { $n = (float)$v; $u = strtolower(substr(trim($v), -1)); return $u === 'g' ? $n * 1024 : ($u === 'k' ? $n / 1024 : $n); };
linha($mb($ini('upload_max_filesize')) >= 20 ? 'ok' : 'aviso', 'upload_max_filesize = ' . $ini('upload_max_filesize') . ' (o sistema aceita até 20 MB por arquivo; sugerido ≥ 32M)');
linha($mb($ini('post_max_size')) >= 20 ? 'ok' : 'aviso', 'post_max_size = ' . $ini('post_max_size') . ' (sugerido ≥ 32M)');
linha($mb($ini('memory_limit')) >= 128 || $ini('memory_limit') === '-1' ? 'ok' : 'aviso', 'memory_limit = ' . $ini('memory_limit') . ' (sugerido ≥ 256M)');
linha((int)$ini('max_execution_time') === 0 || (int)$ini('max_execution_time') >= 60 ? 'ok' : 'aviso', 'max_execution_time = ' . $ini('max_execution_time') . 's (publicar vídeo no Instagram pode levar ~1 min; sugerido ≥ 120)');
linha(function_exists('mail') ? 'ok' : 'aviso', function_exists('mail') ? 'mail() disponível (a entrega depende do plano; teste com ?teste_email=voce@dominio.com)' : 'mail() desativada: os avisos por e-mail não vão funcionar');

// ---- configuração ----
titulo('Configuração');
$cfgFile = __DIR__ . '/config.php';
if (!is_file($cfgFile)) {
    linha('erro', 'config.php não existe. Copie config.sample.php para config.php e preencha (veja PRE_INSTALACAO.md).');
    echo "\nRESULTADO: configure o config.php e rode o diagnóstico de novo.\n";
    exit(1);
}
$cfg = require $cfgFile;
$key = $cli ? ($GLOBALS['argv'][1] ?? '') : ($_GET['key'] ?? '');
if (!hash_equals((string)($cfg['install_key'] ?? ''), (string)$key) || str_starts_with((string)($cfg['install_key'] ?? ''), 'TROQUE')) {
    if (!$cli) {
        http_response_code(403);
    }
    echo "Chave inválida. Use a install_key do seu config.php (e ela não pode ser a de exemplo).\n";
    exit(1);
}
strlen((string)($cfg['install_key'] ?? '')) >= 20 ? linha('ok', 'install_key definida (' . strlen($cfg['install_key']) . ' caracteres)') : linha('aviso', 'install_key curta; use 30+ caracteres aleatórios');
$ak = (string)($cfg['app_key'] ?? '');
($ak !== '' && !str_starts_with($ak, 'TROQUE') && strlen($ak) >= 32) ? linha('ok', 'app_key definida (guarde uma cópia; não troque depois de conectar Instagram/Google)') : linha('aviso', 'app_key ausente ou de exemplo: necessária para guardar com segurança os tokens do Instagram/Google');
$pu = (string)($cfg['public_url'] ?? '');
if ($pu === '' || str_contains($pu, 'SEU-DOMINIO')) {
    linha('aviso', 'public_url não definida (necessária para Instagram/Google): ex. https://marketing.seudominio.com.br');
} else {
    str_starts_with($pu, 'https://') ? linha('ok', "public_url = $pu") : linha('erro', 'public_url precisa começar com https:// (ative o SSL no hPanel)');
}
linha(in_array(($cfg['db']['driver'] ?? 'mysql'), ['mysql'], true) ? 'ok' : 'aviso', 'banco: ' . ($cfg['db']['driver'] ?? 'mysql') . ' (em produção use mysql)');
echo '       fuso horário: ' . ($cfg['timezone'] ?? 'America/Recife') . "\n";

// ---- banco ----
titulo('Banco de dados');
$pdo = null;
try {
    $d = $cfg['db'];
    if (($d['driver'] ?? 'mysql') === 'sqlite') {
        $pdo = new PDO('sqlite:' . $d['path']);
    } else {
        $pdo = new PDO("mysql:host={$d['host']};dbname={$d['name']};charset=utf8mb4", $d['user'], $d['pass'], [PDO::ATTR_TIMEOUT => 6]);
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    linha('ok', 'conexão com o banco funcionou');
    if (($d['driver'] ?? 'mysql') !== 'sqlite') {
        $cs = (string)$pdo->query('SELECT @@character_set_database')->fetchColumn();
        str_starts_with($cs, 'utf8') ? linha('ok', "codificação do banco: $cs") : linha('aviso', "codificação do banco: $cs (recrie o banco como utf8mb4 para não perder acentos)");
    }
    try {
        $n = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
        linha('info', "instalação já feita ($n usuários). Se for a primeira vez e isso aparece, o banco não está vazio.");
    } catch (Throwable) {
        linha('ok', 'banco vazio, pronto para o install.php');
    }
} catch (Throwable $e) {
    linha('erro', 'não conectou ao banco: ' . $e->getMessage() . ' — confira host/usuário/senha em config.php (no hPanel → Bancos de dados MySQL).');
}

// ---- pastas ----
titulo('Pastas e permissões');
foreach (['storage', 'storage/backups', 'storage/ANEXOS'] as $dir) {
    $p = __DIR__ . '/' . $dir;
    if (!is_dir($p) && !@mkdir($p, 0750, true)) {
        linha('erro', "pasta $dir não existe e não pôde ser criada");
        continue;
    }
    $t = $p . '/.teste_' . bin2hex(random_bytes(3));
    if (@file_put_contents($t, 'x') !== false) {
        @unlink($t);
        linha('ok', "$dir com permissão de escrita");
    } else {
        linha('erro', "$dir sem permissão de escrita (hPanel → Gerenciador de Arquivos → permissões 755/750)");
    }
}
is_file(__DIR__ . '/storage/.htaccess') ? linha('ok', 'storage/.htaccess presente (bloqueia acesso direto aos anexos e backups)') : linha('erro', 'storage/.htaccess ausente: anexos e backups ficariam expostos! Envie o arquivo do pacote.');
is_file(__DIR__ . '/.htaccess') ? linha('ok', '.htaccess da raiz presente') : linha('erro', '.htaccess ausente (HTTPS, rotas /api e proteção dos arquivos). Atenção: arquivos que começam com ponto às vezes não sobem pelo FTP; use o Gerenciador de Arquivos.');

// ---- acesso externo ----
titulo('Acesso pela internet');
if ($pu !== '' && !str_contains($pu, 'SEU-DOMINIO') && function_exists('curl_init')) {
    $get = function (string $path) use ($pu): array {
        $ch = curl_init(rtrim($pu, '/') . $path);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_FOLLOWLOCATION => false, CURLOPT_SSL_VERIFYPEER => true]);
        $b = curl_exec($ch);
        $s = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $e = curl_error($ch);
        curl_close($ch);
        return [$s, (string)$b, $e];
    };
    [$s, $b, $e] = $get('/api/heartbeat');
    if ($s === 200 && str_contains($b, '"ok"')) {
        linha('ok', 'rotas /api funcionando (mod_rewrite ativo)');
    } elseif ($s === 0) {
        linha('aviso', "não foi possível acessar $pu pelo próprio servidor ($e). Teste manualmente no navegador: $pu/api/heartbeat deve mostrar {\"ok\":true}");
    } else {
        linha('erro', "$pu/api/heartbeat respondeu HTTP $s. As rotas /api não estão funcionando: confira se o .htaccess foi enviado e se o servidor é Apache/LiteSpeed.");
    }
    foreach (['/config.php' => 'config.php', '/storage/.htaccess' => 'pasta storage', '/install.php?key=x' => null] as $path => $nome) {
        if ($nome === null) {
            continue;
        }
        [$s2, $b2] = $get($path);
        if ($s2 === 0) {
            linha('aviso', "$nome: proteção não verificada (o servidor não consegue se acessar). Abra $pu$path no navegador: deve dar erro 403 ou 404, nunca mostrar conteúdo.");
            continue;
        }
        ($s2 === 403 || $s2 === 404) ? linha('ok', "$nome protegido (HTTP $s2)") : linha('erro', "$nome ACESSÍVEL pela internet (HTTP $s2)! Corrija o .htaccess antes de continuar.");
    }
    [$s3] = $get('/');
    if ($s3 !== 0) {
        ($s3 === 200) ? linha('ok', 'página inicial abre (HTTP 200)') : linha('aviso', "página inicial respondeu HTTP $s3");
    }
} else {
    linha('info', 'defina public_url no config.php para testar o acesso pela internet');
}

// ---- dados a importar ----
titulo('Dados a importar (opcional)');
$imp = __DIR__ . '/storage/import/DADOS';
if (is_dir($imp) && extension_loaded('zip')) {
    require_once __DIR__ . '/api/xlsx.php';
    $tot = 0;
    $arqs = glob($imp . '/EVO_MKT_*.xlsx') ?: [];
    foreach ($arqs as $f) {
        try {
            [$h, $rows] = readXlsx($f);
            $ids = count(array_filter($rows, fn($r) => trim($r['id'] ?? '') !== ''));
            $tot += $ids;
            echo sprintf("       %-28s %4d registro(s)%s\n", basename($f), $ids, count($rows) !== $ids ? ' (' . (count($rows) - $ids) . ' sem ID serão ignorados)' : '');
        } catch (Throwable $e) {
            linha('erro', basename($f) . ': ' . $e->getMessage());
        }
    }
    linha($arqs ? 'ok' : 'aviso', count($arqs) . ' planilha(s) encontrada(s), ' . $tot . ' registro(s) serão importados pelo install.php');
} else {
    linha('info', 'nenhuma pasta storage/import/DADOS (sistema começa vazio). Para migrar os dados atuais, envie os XLSX da pasta DADOS para storage/import/DADOS/ antes de rodar o install.php.');
}
is_file(__DIR__ . '/storage/installed.lock') ? linha('info', 'install.php já foi executado (storage/installed.lock existe)') : linha('info', 'install.php ainda não executado');

// ---- e-mail de teste ----
if (!$cli && !empty($_GET['teste_email']) && filter_var($_GET['teste_email'], FILTER_VALIDATE_EMAIL)) {
    titulo('Teste de e-mail');
    $ok = @mail($_GET['teste_email'], 'Teste EVO MKT', "Se você recebeu isto, o e-mail do servidor funciona.\n", 'From: ' . ($cfg['mail_from'] ?? 'nao-responda@' . ($_SERVER['HTTP_HOST'] ?? 'localhost')));
    linha($ok ? 'ok' : 'erro', $ok ? 'e-mail entregue ao servidor de envio — confira a caixa de entrada e o spam' : 'o servidor recusou o envio');
}

echo "\nRESULTADO: {$res['ok']} ok · {$res['aviso']} atenção · {$res['erro']} erro(s)\n";
echo $res['erro'] ? "Corrija os ERROS acima antes de rodar o install.php.\n" : ($res['aviso'] ? "Pode instalar; os itens de ATENÇÃO afetam só recursos opcionais.\n" : "Tudo pronto! Rode o install.php e depois APAGUE install.php e diagnostico.php.\n");
exit($res['erro'] ? 1 : 0);

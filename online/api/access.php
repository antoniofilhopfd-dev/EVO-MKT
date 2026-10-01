<?php
declare(strict_types=1);
/**
 * Modo de acesso "somente código" (2 letras + 4 números), com proteções extras:
 *  - códigos aleatórios, guardados só como HMAC (o servidor não consegue ler o código depois);
 *  - limite de tentativas por IP + atraso progressivo + modo de proteção global (só aparelhos já conhecidos entram);
 *  - alerta por e-mail e auditoria a cada aparelho novo;
 *  - ações sensíveis da Gerente exigem a "senha de administração" (confirmação extra).
 * O modo (senha | codigo) fica salvo em integration_settings ('login_modo'). Padrão: senha.
 */

function ensureAccessSchema(): void
{
    static $done = false;
    if ($done) {
        return;
    }
    ensureIntegrationSchema();
    $ine = isSqlite() ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
    $k = isSqlite() ? 'TEXT' : 'VARCHAR(64)';
    db()->exec("CREATE TABLE IF NOT EXISTS trusted_devices(hash VARCHAR(64) PRIMARY KEY,codigo $k NOT NULL,tipo VARCHAR(10) NOT NULL,criado VARCHAR(40) NOT NULL,visto VARCHAR(40) NOT NULL)$ine");
    foreach (['users', 'portal_users'] as $tab) {
        try {
            db()->exec("ALTER TABLE $tab ADD COLUMN acesso_hmac VARCHAR(64) NULL");
        } catch (Throwable) {
            // coluna já existe
        }
    }
    $done = true;
}
function loginMode(): string
{
    return setting('login_modo', 'senha') === 'codigo' ? 'codigo' : 'senha';
}
function accessHmac(string $code): string
{
    return hash_hmac('sha256', strtoupper(trim($code)), appKey());
}
function validCodeFormat(string $c): bool
{
    return (bool)preg_match('/^[A-HJ-NP-Z]{2}[0-9]{4}$/', strtoupper(trim($c)));
}
/** 2 letras (sem I e O, que se confundem com 1 e 0) + 4 números, sem sequências óbvias. */
function genAccessCode(): string
{
    $L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    for ($i = 0; $i < 200; $i++) {
        $n = sprintf('%04d', random_int(0, 9999));
        if (preg_match('/^(\d)\1{3}$/', $n) || in_array($n, ['1234', '4321', '0123', '3210', '1111', '0000'], true)) {
            continue;
        }
        $c = $L[random_int(0, 23)] . $L[random_int(0, 23)] . $n;
        $h = accessHmac($c);
        if (!q('SELECT 1 FROM users WHERE acesso_hmac=?', [$h])->fetch() && !q('SELECT 1 FROM portal_users WHERE acesso_hmac=?', [$h])->fetch()) {
            return $c;
        }
    }
    throw new RuntimeException('Não foi possível gerar um código único.');
}
function issueAccessCode(string $tab, string $codigo): string
{
    ensureAccessSchema();
    $c = genAccessCode();
    q("UPDATE $tab SET acesso_hmac=? WHERE codigo=?", [accessHmac($c), $codigo]);
    q('DELETE FROM sessions WHERE codigo=?', [$codigo]);
    q('DELETE FROM trusted_devices WHERE codigo=?', [$codigo]);
    return $c;
}

// ---------- aparelhos conhecidos ----------
function deviceCookie(): string
{
    return (string)($_COOKIE['evo_dev'] ?? '');
}
function knownDevice(): bool
{
    $c = deviceCookie();
    return $c !== '' && (bool)q('SELECT 1 FROM trusted_devices WHERE hash=?', [hash('sha256', $c)])->fetch();
}
/** Registra o aparelho (se novo, avisa a Gerente) e renova o cookie de 1 ano. */
function registerDevice(string $tipo, string $codigo, string $nome): void
{
    $c = deviceCookie();
    $h = $c !== '' ? hash('sha256', $c) : '';
    $row = $h !== '' ? q('SELECT * FROM trusted_devices WHERE hash=? AND codigo=?', [$h, $codigo])->fetch() : false;
    if (!$row) {
        $c = bin2hex(random_bytes(24));
        $h = hash('sha256', $c);
        q('INSERT INTO trusted_devices(hash,codigo,tipo,criado,visto) VALUES(?,?,?,?,?)', [$h, $codigo, $tipo, now(), now()]);
        $ua = mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 120);
        audit($codigo, 'novo-dispositivo');
        $msg = "$nome ($codigo) entrou de um aparelho novo.\nIP: " . ip() . "\nNavegador: $ua\nHorário: " . date('d/m/Y H:i') . "\n\nSe não foi essa pessoa, gere um novo código em Administração → Acessos.";
        notifyMail('Novo acesso: ' . $nome, $msg);
        $mine = emailForPerson($nome);
        if ($mine !== '') {
            notifyMail('Novo acesso à sua conta no EVO MKT', $msg, $mine);
        }
    } else {
        q('UPDATE trusted_devices SET visto=? WHERE hash=?', [now(), $h]);
    }
    setcookie('evo_dev', $c, ['expires' => time() + 365 * 86400, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict', 'secure' => !empty($_SERVER['HTTPS']) || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https']);
}

// ---------- proteção contra adivinhação ----------
function countAttempts(string $key): int
{
    return (int)q('SELECT COUNT(*) c FROM login_attempts WHERE chave=? AND quando>?', [$key, time() - 900])->fetch()['c'];
}
function codeLoginGuard(): void
{
    ensureAccessSchema();
    q('DELETE FROM login_attempts WHERE quando<?', [time() - 900]);
    $max = (int)(cfg()['login_ip_max'] ?? 10);
    $n = countAttempts('cip|' . ip());
    if ($n >= $max) {
        fail(429, 'Muitas tentativas deste endereço. Aguarde 15 minutos.');
    }
    $gmax = (int)(cfg()['login_global_max'] ?? 150);
    if (countAttempts('cglobal') >= $gmax && !knownDevice()) {
        fail(429, 'Proteção ativada: houve muitas tentativas recentes. Entre por um aparelho em que você já acessou ou aguarde alguns minutos.');
    }
    if ($n > 0) {
        usleep(min($n, 5) * (int)(cfg()['login_delay_ms'] ?? 300) * 1000); // atraso progressivo
    }
}
function codeLoginFail(string $quem): never
{
    rateFail('cip|' . ip());
    rateFail('cglobal');
    audit($quem, 'login-falhou');
    $g = countAttempts('cglobal');
    $gmax = (int)(cfg()['login_global_max'] ?? 150);
    if ($g === $gmax) {
        notifyMail('Alerta: muitas tentativas de acesso', "Foram registradas $g tentativas de código inválido nos últimos 15 minutos. O modo de proteção foi ativado: só aparelhos já conhecidos conseguem entrar. Último IP: " . ip());
    }
    fail(401, 'Código inválido.');
}

// ---------- confirmação extra da Gerente ----------
function stepUp(array $manager, array $in): void
{
    if (loginMode() !== 'codigo') {
        return;
    }
    $key = 'step|' . $manager['codigo'];
    rateCheck($key, 5);
    $row = q('SELECT pass_hash FROM users WHERE codigo=?', [$manager['codigo']])->fetch();
    if (!$row || !password_verify((string)($in['senhaAdmin'] ?? ''), $row['pass_hash'])) {
        if (isset($in['senhaAdmin'])) {
            rateFail($key);
        }
        fail(403, 'Confirme sua senha de administração.');
    }
}

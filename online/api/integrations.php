<?php
declare(strict_types=1);
/**
 * Integrações: Instagram (Meta Graph API) e Google (Agenda, Drive, Planilhas).
 * Segredos ficam no banco, criptografados (AES-256-GCM) com a chave 'app_key' do config.php.
 * As URLs-base podem ser trocadas no config.php (usadas pelos testes com servidores simulados).
 */

function ensureIntegrationSchema(): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $t = isSqlite() ? 'TEXT' : 'LONGTEXT';
    $k = isSqlite() ? 'TEXT' : 'VARCHAR(64)';
    $ine = isSqlite() ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
    $pk = isSqlite() ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'BIGINT AUTO_INCREMENT PRIMARY KEY';
    foreach ([
        "CREATE TABLE IF NOT EXISTS integration_settings(k VARCHAR(64) PRIMARY KEY,v $t NOT NULL)$ine",
        "CREATE TABLE IF NOT EXISTS integration_log(id $pk,quando VARCHAR(40) NOT NULL,servico VARCHAR(20) NOT NULL,nivel VARCHAR(10) NOT NULL,msg VARCHAR(500) NOT NULL)$ine",
        "CREATE TABLE IF NOT EXISTS google_event_map(modulo $k NOT NULL,id $k NOT NULL,event_id VARCHAR(128) NOT NULL,hash VARCHAR(40) NOT NULL,PRIMARY KEY(modulo,id))$ine",
        "CREATE TABLE IF NOT EXISTS ig_publish(conteudo_id $k PRIMARY KEY,status VARCHAR(20) NOT NULL,container_id VARCHAR(64) NOT NULL,media_id VARCHAR(64) NOT NULL,erro VARCHAR(500) NOT NULL,quando VARCHAR(40) NOT NULL)$ine",
    ] as $sql) {
        db()->exec($sql);
    }
    $done = true;
}

// ---------- segredos ----------
function appKey(): string
{
    $c = cfg();
    return hash('sha256', (string)($c['app_key'] ?? $c['install_key'] ?? ''), true);
}
function encryptSecret(string $plain): string
{
    $iv = random_bytes(12);
    $tag = '';
    $ct = openssl_encrypt($plain, 'aes-256-gcm', appKey(), OPENSSL_RAW_DATA, $iv, $tag);
    return 'enc:' . base64_encode($iv . $tag . $ct);
}
function decryptSecret(string $stored): string
{
    if (!str_starts_with($stored, 'enc:')) {
        return $stored;
    }
    $raw = base64_decode(substr($stored, 4), true) ?: '';
    $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', appKey(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
    return $plain === false ? '' : $plain;
}
const SECRET_KEYS = ['meta_app_secret', 'meta_token', 'g_client_secret', 'g_refresh_token', 'g_access_token'];
function setting(string $k, string $default = ''): string
{
    ensureIntegrationSchema();
    $r = q('SELECT v FROM integration_settings WHERE k=?', [$k])->fetch();
    if (!$r) {
        return $default;
    }
    return in_array($k, SECRET_KEYS, true) ? decryptSecret($r['v']) : $r['v'];
}
function setSetting(string $k, string $v): void
{
    ensureIntegrationSchema();
    $store = in_array($k, SECRET_KEYS, true) && $v !== '' ? encryptSecret($v) : $v;
    if (q('SELECT 1 FROM integration_settings WHERE k=?', [$k])->fetch()) {
        q('UPDATE integration_settings SET v=? WHERE k=?', [$store, $k]);
    } else {
        q('INSERT INTO integration_settings(k,v) VALUES(?,?)', [$k, $store]);
    }
}
function intLog(string $servico, string $nivel, string $msg): void
{
    try {
        ensureIntegrationSchema();
        q('INSERT INTO integration_log(quando,servico,nivel,msg) VALUES(?,?,?,?)', [now(), $servico, $nivel, mb_substr($msg, 0, 480)]);
        q('DELETE FROM integration_log WHERE id < (SELECT m FROM (SELECT MAX(id)-500 m FROM integration_log) x)');
    } catch (Throwable) {
    }
}

// ---------- HTTP ----------
/** @return array{0:int,1:mixed} [status, json|raw] */
function httpCall(string $method, string $url, array $headers = [], mixed $body = null, int $timeout = 25): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    $resp = curl_exec($ch);
    $st = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($resp === false) {
        throw new RuntimeException('Falha de rede: ' . $err);
    }
    $j = json_decode((string)$resp, true);
    return [$st, $j ?? $resp];
}
function httpOk(array $r, string $ctx): mixed
{
    [$st, $j] = $r;
    if ($st >= 200 && $st < 300) {
        return $j;
    }
    $msg = is_array($j) ? ($j['error']['message'] ?? $j['error_description'] ?? (is_string($j['error'] ?? null) ? $j['error'] : json_encode($j))) : (string)$j;
    throw new RuntimeException("$ctx: HTTP $st — " . mb_substr((string)$msg, 0, 300));
}
function publicUrl(): string
{
    $c = cfg();
    if (!empty($c['public_url'])) {
        return rtrim((string)$c['public_url'], '/');
    }
    $https = !empty($_SERVER['HTTPS']) || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    return ($https ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'localhost');
}
function signState(string $purpose): string
{
    $p = base64_encode(json_encode(['p' => $purpose, 't' => time(), 'n' => bin2hex(random_bytes(6))]));
    return $p . '.' . hash_hmac('sha256', $p, appKey());
}
function checkState(string $state, string $purpose): bool
{
    [$p, $sig] = array_pad(explode('.', $state, 2), 2, '');
    if (!hash_equals(hash_hmac('sha256', $p, appKey()), $sig)) {
        return false;
    }
    $d = json_decode((string)base64_decode($p), true);
    return is_array($d) && ($d['p'] ?? '') === $purpose && time() - (int)($d['t'] ?? 0) < 900;
}

// =====================================================================
// INSTAGRAM (Meta Graph API)
// =====================================================================
function metaBase(): string
{
    return rtrim((string)(cfg()['meta_graph_base'] ?? 'https://graph.facebook.com/v21.0'), '/');
}
function metaGet(string $path, array $params = []): array
{
    $params['access_token'] = setting('meta_token');
    return (array)httpOk(httpCall('GET', metaBase() . $path . '?' . http_build_query($params)), "Meta GET $path");
}
function metaPost(string $path, array $params = []): array
{
    $params['access_token'] = setting('meta_token');
    return (array)httpOk(httpCall('POST', metaBase() . $path, ['Content-Type: application/x-www-form-urlencoded'], http_build_query($params)), "Meta POST $path");
}
function metaConnected(): bool
{
    return setting('meta_token') !== '' && setting('ig_user_id') !== '';
}
function metaConnectUrl(): string
{
    $id = setting('meta_app_id');
    if ($id === '' || setting('meta_app_secret') === '') {
        fail(400, 'Informe o App ID e o App Secret da Meta primeiro.');
    }
    $oauth = rtrim((string)(cfg()['meta_oauth_base'] ?? 'https://www.facebook.com/v21.0/dialog/oauth'), '/');
    return $oauth . '?' . http_build_query([
        'client_id' => $id,
        'redirect_uri' => publicUrl() . '/api/integrations/meta/callback',
        'state' => signState('meta'),
        'response_type' => 'code',
        'scope' => 'instagram_basic,instagram_manage_insights,instagram_content_publish,pages_show_list,pages_read_engagement,business_management',
    ]);
}
function metaFinishConnect(string $code): void
{
    $id = setting('meta_app_id');
    $secret = setting('meta_app_secret');
    $redirect = publicUrl() . '/api/integrations/meta/callback';
    $short = (array)httpOk(httpCall('GET', metaBase() . '/oauth/access_token?' . http_build_query(['client_id' => $id, 'client_secret' => $secret, 'redirect_uri' => $redirect, 'code' => $code])), 'Meta token');
    $long = (array)httpOk(httpCall('GET', metaBase() . '/oauth/access_token?' . http_build_query(['grant_type' => 'fb_exchange_token', 'client_id' => $id, 'client_secret' => $secret, 'fb_exchange_token' => $short['access_token'] ?? ''])), 'Meta token longo');
    setSetting('meta_token', (string)($long['access_token'] ?? ''));
    setSetting('meta_token_expira', (string)(time() + (int)($long['expires_in'] ?? 5184000)));
    metaDiscoverAccount();
}
function metaDiscoverAccount(): void
{
    $r = metaGet('/me/accounts', ['fields' => 'name,instagram_business_account{id,username}']);
    foreach ($r['data'] ?? [] as $page) {
        if (!empty($page['instagram_business_account']['id'])) {
            setSetting('ig_user_id', (string)$page['instagram_business_account']['id']);
            setSetting('ig_username', (string)($page['instagram_business_account']['username'] ?? ''));
            setSetting('meta_page_name', (string)($page['name'] ?? ''));
            intLog('instagram', 'ok', 'Conectado como @' . setting('ig_username'));
            return;
        }
    }
    throw new RuntimeException('Nenhuma conta Instagram profissional encontrada nas Páginas deste usuário. Ligue o Instagram à Página do Facebook.');
}
function metaRefreshIfNeeded(): void
{
    $exp = (int)setting('meta_token_expira', '0');
    if (!metaConnected() || $exp === 0 || $exp - time() > 10 * 86400) {
        return;
    }
    $j = (array)httpOk(httpCall('GET', metaBase() . '/oauth/access_token?' . http_build_query(['grant_type' => 'fb_exchange_token', 'client_id' => setting('meta_app_id'), 'client_secret' => setting('meta_app_secret'), 'fb_exchange_token' => setting('meta_token')])), 'Meta renovar token');
    setSetting('meta_token', (string)$j['access_token']);
    setSetting('meta_token_expira', (string)(time() + (int)($j['expires_in'] ?? 5184000)));
    intLog('instagram', 'ok', 'Token renovado');
}
function metaInsightTotal(string $ig, array $metrics, int $since, int $until): array
{
    $out = [];
    $r = metaGet("/$ig/insights", ['metric' => implode(',', $metrics), 'metric_type' => 'total_value', 'period' => 'day', 'since' => $since, 'until' => $until]);
    foreach ($r['data'] ?? [] as $m) {
        $out[$m['name']] = (int)($m['total_value']['value'] ?? 0);
    }
    return $out;
}
/** Sincroniza o mês atual e o anterior na tela Instagram. Retorna nº de períodos gravados. */
function igSync(int $months = 2): int
{
    if (!metaConnected()) {
        throw new RuntimeException('Instagram não conectado.');
    }
    $ig = setting('ig_user_id');
    $profile = metaGet("/$ig", ['fields' => 'followers_count,follows_count,media_count,username']);
    $media = metaGet("/$ig/media", ['fields' => 'id,caption,media_type,media_product_type,timestamp,like_count,comments_count,permalink', 'limit' => 100])['data'] ?? [];
    $n = 0;
    for ($i = 0; $i < $months; $i++) {
        $first = new DateTimeImmutable('first day of this month 00:00:00 -' . $i . ' month');
        $last = $first->modify('first day of next month');
        $per = $first->format('Y-m');
        $since = $first->getTimestamp();
        $until = min($last->getTimestamp(), time());
        $ins = metaInsightTotal($ig, ['reach', 'views', 'profile_views', 'total_interactions', 'likes', 'comments', 'shares', 'saves'], $since, $until);
        $posts = 0;
        $reels = 0;
        $best = [];
        foreach ($media as $m) {
            if (substr((string)$m['timestamp'], 0, 7) !== $per) {
                continue;
            }
            if (($m['media_product_type'] ?? '') === 'REELS') {
                $reels++;
            } else {
                $posts++;
            }
            $best[] = [(int)($m['like_count'] ?? 0) + (int)($m['comments_count'] ?? 0), $m];
        }
        usort($best, fn($a, $b) => $b[0] <=> $a[0]);
        $top = array_map(fn($b) => mb_substr(trim(preg_replace('/\s+/', ' ', (string)($b[1]['caption'] ?? 'Sem legenda'))), 0, 60) . ' — ' . $b[0] . ' interações (' . ($b[1]['permalink'] ?? '') . ')', array_slice($best, 0, 3));
        $row = [
            'titulo' => (new IntlDateFormatterFallback())->month($first),
            'periodo' => $per, 'dataInicio' => $first->format('Y-m-d'), 'origem' => 'INSTAGRAM_API', 'idExterno' => $ig,
            'status' => 'ATIVO', 'ultimaSincronizacao' => now(),
            'seguidores' => (string)($profile['followers_count'] ?? 0),
            'alcance' => (string)($ins['reach'] ?? 0), 'impressoes' => (string)($ins['views'] ?? 0),
            'visitasPerfil' => (string)($ins['profile_views'] ?? 0), 'interacoes' => (string)($ins['total_interactions'] ?? 0),
            'curtidas' => (string)($ins['likes'] ?? 0), 'comentarios' => (string)($ins['comments'] ?? 0),
            'compartilhamentos' => (string)($ins['shares'] ?? 0), 'salvamentos' => (string)($ins['saves'] ?? 0),
            'posts' => (string)$posts, 'reels' => (string)$reels, 'melhoresConteudos' => implode("\n", $top),
        ];
        $exist = null;
        foreach (listRows('instagram') as $r) {
            if (($r['origem'] ?? '') === 'INSTAGRAM_API' && ($r['periodo'] ?? '') === $per) {
                $exist = $r;
                break;
            }
        }
        if ($exist) {
            updateRow('instagram', $exist['id'], $row, 'integracao:instagram');
        } else {
            insertRow('instagram', $row, 'integracao:instagram');
        }
        $n++;
    }
    setSetting('ig_last_sync', now());
    intLog('instagram', 'ok', "Métricas sincronizadas ($n período(s)); seguidores: " . ($profile['followers_count'] ?? '?'));
    return $n;
}
final class IntlDateFormatterFallback
{
    public function month(DateTimeImmutable $d): string
    {
        $m = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        return ucfirst($m[(int)$d->format('n') - 1]) . ' de ' . $d->format('Y');
    }
}

// ---- mídia pública assinada (a Meta baixa a imagem/vídeo por esta URL) ----
function signedMediaUrl(string $relPath, int $ttl = 3600): string
{
    $e = time() + $ttl;
    $p = rtrim(strtr(base64_encode($relPath), '+/', '-_'), '=');
    return publicUrl() . '/api/public/media?p=' . $p . '&e=' . $e . '&s=' . hash_hmac('sha256', "$p|$e", appKey());
}
function serveSignedMedia(): never
{
    $p = (string)($_GET['p'] ?? '');
    $e = (int)($_GET['e'] ?? 0);
    $s = (string)($_GET['s'] ?? '');
    if ($e < time() || !hash_equals(hash_hmac('sha256', "$p|$e", appKey()), $s)) {
        fail(403, 'Link expirado ou inválido.');
    }
    $rel = (string)base64_decode(strtr($p, '-_', '+/'));
    if (!str_starts_with($rel, 'ANEXOS/CONTEUDOS/') || str_contains($rel, '..')) {
        fail(400, 'Caminho inválido.');
    }
    $base = realpath(__DIR__ . '/../storage/ANEXOS/CONTEUDOS');
    $fp = realpath(__DIR__ . '/../storage/' . $rel);
    if (!$base || !$fp || !str_starts_with($fp, $base . DIRECTORY_SEPARATOR) || !is_file($fp)) {
        fail(404, 'Arquivo não encontrado.');
    }
    $ext = strtolower(pathinfo($fp, PATHINFO_EXTENSION));
    header_remove('Content-Type');
    header('Content-Type: ' . (['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'mp4' => 'video/mp4', 'mov' => 'video/quicktime'][$ext] ?? 'application/octet-stream'));
    header('Content-Length: ' . filesize($fp));
    readfile($fp);
    exit;
}
function igSaveMedia(string $conteudoId): string
{
    $row = getRow('conteudos', $conteudoId) ?? fail(404, 'Conteúdo não encontrado.');
    if (empty($_FILES['files']) && empty($_FILES['file'])) {
        fail(400, 'Envie um arquivo.');
    }
    $f = $_FILES['files'] ?? $_FILES['file'];
    $name = is_array($f['name']) ? $f['name'][0] : $f['name'];
    $tmp = is_array($f['tmp_name']) ? $f['tmp_name'][0] : $f['tmp_name'];
    $err = is_array($f['error']) ? $f['error'][0] : $f['error'];
    $size = is_array($f['size']) ? $f['size'][0] : $f['size'];
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if ($err !== UPLOAD_ERR_OK) {
        fail(400, 'Falha no envio do arquivo.');
    }
    if (!in_array($ext, ['jpg', 'jpeg', 'mp4', 'mov'], true)) {
        fail(400, 'O Instagram aceita imagem JPEG (.jpg) ou vídeo (.mp4/.mov).');
    }
    if ($size > ((int)(cfg()['max_upload_mb'] ?? 20)) * 1048576) {
        fail(413, 'Arquivo acima do limite de upload do servidor.');
    }
    $dir = __DIR__ . '/../storage/ANEXOS/CONTEUDOS/' . preg_replace('/[^A-Za-z0-9._-]/', '_', $conteudoId);
    if (!is_dir($dir) && !mkdir($dir, 0750, true)) {
        fail(500, 'Não foi possível criar a pasta.');
    }
    $dst = $dir . '/midia_' . bin2hex(random_bytes(4)) . '.' . $ext;
    (move_uploaded_file($tmp, $dst) || rename($tmp, $dst)) || fail(500, 'Não foi possível gravar o arquivo.');
    $rel = 'ANEXOS/CONTEUDOS/' . basename($dir) . '/' . basename($dst);
    $row['midiaInstagram'] = $rel;
    $row['atualizadoEm'] = now();
    saveRow('conteudos', $row);
    return $rel;
}
/** Registra falha de publicação (sem sobrescrever um conteúdo já PUBLICADO). */
function igMarkError(string $conteudoId, string $msg): void
{
    ensureIntegrationSchema();
    $cur = q('SELECT status FROM ig_publish WHERE conteudo_id=?', [$conteudoId])->fetch();
    if ($cur && $cur['status'] === 'PUBLICADO') {
        return;
    }
    q('DELETE FROM ig_publish WHERE conteudo_id=?', [$conteudoId]);
    q('INSERT INTO ig_publish(conteudo_id,status,container_id,media_id,erro,quando) VALUES(?,?,?,?,?,?)', [$conteudoId, 'ERRO', '', '', mb_substr($msg, 0, 480), now()]);
}
/** Publica no Instagram. Retorna ['status'=>'PUBLICADO'|'PROCESSANDO','link'=>...]. */
function igPublish(string $conteudoId, string $ator): array
{
    ensureIntegrationSchema();
    if (!metaConnected()) {
        throw new RuntimeException('Instagram não conectado.');
    }
    $r = getRow('conteudos', $conteudoId) ?? throw new RuntimeException('Conteúdo não encontrado.');
    $rel = (string)($r['midiaInstagram'] ?? '');
    if ($rel === '') {
        throw new RuntimeException('Anexe a mídia (JPEG ou vídeo) antes de publicar.');
    }
    if (!empty($r['instagramMediaId'])) {
        throw new RuntimeException('Este conteúdo já foi publicado.');
    }
    $fmt = mb_strtolower((string)($r['formato'] ?? 'feed'));
    if (str_contains($fmt, 'carrossel')) {
        throw new RuntimeException('Carrossel ainda não é publicado automaticamente: publique manualmente.');
    }
    $isVideo = in_array(strtolower(pathinfo($rel, PATHINFO_EXTENSION)), ['mp4', 'mov'], true);
    $ig = setting('ig_user_id');
    $caption = trim((string)($r['legenda'] ?? $r['titulo'] ?? '')) . (empty($r['cta']) ? '' : "\n\n" . $r['cta']);
    $p = ['caption' => $caption];
    $url = signedMediaUrl($rel, 7200);
    if (str_contains($fmt, 'stor')) {
        $p['media_type'] = 'STORIES';
        $p[$isVideo ? 'video_url' : 'image_url'] = $url;
    } elseif ($isVideo || str_contains($fmt, 'reel')) {
        $p['media_type'] = 'REELS';
        $p['video_url'] = $url;
    } else {
        $p['image_url'] = $url;
    }
    $st = q('SELECT * FROM ig_publish WHERE conteudo_id=?', [$conteudoId])->fetch();
    $container = $st['container_id'] ?? '';
    if ($container === '') {
        $container = (string)metaPost("/$ig/media", $p)['id'];
        q('DELETE FROM ig_publish WHERE conteudo_id=?', [$conteudoId]);
        q('INSERT INTO ig_publish(conteudo_id,status,container_id,media_id,erro,quando) VALUES(?,?,?,?,?,?)', [$conteudoId, 'PROCESSANDO', $container, '', '', now()]);
    }
    $status = 'FINISHED';
    for ($i = 0; $i < 12; $i++) {
        $status = (string)(metaGet("/$container", ['fields' => 'status_code'])['status_code'] ?? 'FINISHED');
        if ($status === 'FINISHED' || $status === 'ERROR' || $status === 'EXPIRED') {
            break;
        }
        sleep(5);
    }
    if ($status === 'ERROR' || $status === 'EXPIRED') {
        q('UPDATE ig_publish SET status=?,erro=?,quando=? WHERE conteudo_id=?', ['ERRO', "Instagram recusou a mídia ($status)", now(), $conteudoId]);
        throw new RuntimeException("O Instagram recusou a mídia ($status). Verifique formato, proporção e tamanho.");
    }
    if ($status !== 'FINISHED') {
        q('UPDATE ig_publish SET quando=? WHERE conteudo_id=?', [now(), $conteudoId]);
        return ['status' => 'PROCESSANDO', 'link' => ''];
    }
    $mediaId = (string)metaPost("/$ig/media_publish", ['creation_id' => $container])['id'];
    $link = (string)(metaGet("/$mediaId", ['fields' => 'permalink'])['permalink'] ?? '');
    q('UPDATE ig_publish SET status=?,media_id=?,erro=?,quando=? WHERE conteudo_id=?', ['PUBLICADO', $mediaId, '', now(), $conteudoId]);
    updateRow('conteudos', $conteudoId, ['status' => 'PUBLICADO', 'instagramMediaId' => $mediaId, 'instagramLink' => $link, 'publicadoEm' => now()], $ator);
    intLog('instagram', 'ok', "Publicado: $conteudoId → $link");
    return ['status' => 'PUBLICADO', 'link' => $link];
}
/** Publica o que está programado e vencido (usado pelo cron). */
function igPublishDue(): int
{
    if (!metaConnected()) {
        return 0;
    }
    $n = 0;
    foreach (listRows('conteudos') as $r) {
        if (($r['publicarInstagram'] ?? '') !== 'SIM' || !empty($r['instagramMediaId']) || empty($r['midiaInstagram'])) {
            continue;
        }
        if (!preg_match('/APROVADO|PROGRAMADO/i', (string)($r['status'] ?? ''))) {
            continue;
        }
        $prev = q('SELECT status FROM ig_publish WHERE conteudo_id=?', [$r['id']])->fetch();
        if ($prev && $prev['status'] === 'ERRO') {
            continue; // falhou antes: só tenta de novo quando alguém clicar em "Publicar agora"
        }
        $when = (string)($r['publicacaoEm'] ?? '');
        if ($when === '' || strtotime($when) > time()) {
            continue;
        }
        try {
            $res = igPublish($r['id'], 'cron');
            if ($res['status'] === 'PUBLICADO') {
                $n++;
            }
        } catch (Throwable $e) {
            igMarkError($r['id'], $e->getMessage());
            intLog('instagram', 'erro', $r['id'] . ': ' . $e->getMessage());
            notifyMail('Falha ao publicar no Instagram', ($r['titulo'] ?? $r['id']) . "\n" . $e->getMessage());
        }
    }
    return $n;
}

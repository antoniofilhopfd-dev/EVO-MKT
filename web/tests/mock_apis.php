<?php
// Servidor SIMULADO da Meta (Graph API) e do Google — somente para testes. Uso: php -S 127.0.0.1:8099 tests/mock_apis.php
$F = sys_get_temp_dir() . '/evo_mock_state.json';
$S = is_file($F) ? json_decode(file_get_contents($F), true) : [];
$S += ['seq' => 0, 'containers' => [], 'published' => [], 'events' => [], 'folders' => [], 'files' => [], 'sheets' => [], 'values' => [], 'calls' => []];
register_shutdown_function(function () use (&$S, $F) { file_put_contents($F, json_encode($S)); });
function j($d, int $c = 200) { http_response_code($c); header('Content-Type: application/json'); echo json_encode($d); exit; }
function nid(string $p) { global $S; return $p . (++$S['seq']); }
$m = $_SERVER['REQUEST_METHOD'];
$p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$raw = file_get_contents('php://input');
$in = json_decode($raw, true) ?: [];
if ($m !== 'GET' && !$in && $raw !== '' && !str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'multipart') && !str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'json')) { parse_str($raw, $in); }
$S['calls'][] = "$m $p";
if ($p === '/__reset') { $S = ['seq' => 0, 'containers' => [], 'published' => [], 'events' => [], 'folders' => [], 'files' => [], 'sheets' => [], 'values' => [], 'calls' => []]; j(['ok' => true]); }
if ($p === '/__state') { j($S); }
// ---------------- META ----------------
if (str_starts_with($p, '/graph')) {
    $g = substr($p, 6);
    $tok = $_GET['access_token'] ?? ($in['access_token'] ?? '');
    $IG = '17841400000000000';
    if ($g === '/oauth/access_token') {
        if (($_GET['grant_type'] ?? '') === 'fb_exchange_token') { if (($_GET['client_secret'] ?? '') !== 'META_SECRET') j(['error' => ['message' => 'bad secret']], 400); j(['access_token' => 'LONG_TOKEN', 'expires_in' => 5184000]); }
        if (($_GET['code'] ?? '') !== 'GOODCODE') j(['error' => ['message' => 'Invalid verification code']], 400);
        j(['access_token' => 'SHORT_TOKEN']);
    }
    if ($tok === '') j(['error' => ['message' => 'Missing access token']], 401);
    if ($g === '/me/accounts') j(['data' => [['name' => 'Colégio Evolução', 'id' => 'p1', 'instagram_business_account' => ['id' => $IG, 'username' => 'evolucaopb']]]]);
    if ($g === "/$IG") j(['followers_count' => 4600, 'follows_count' => 120, 'media_count' => 310, 'username' => 'evolucaopb']);
    if ($g === "/$IG/insights") {
        $vals = ['reach' => 18000, 'views' => 26000, 'profile_views' => 1100, 'total_interactions' => 2300, 'likes' => 1500, 'comments' => 200, 'shares' => 110, 'saves' => 490];
        $d = []; foreach (explode(',', $_GET['metric'] ?? '') as $k) { $d[] = ['name' => $k, 'period' => 'day', 'total_value' => ['value' => $vals[$k] ?? 0]]; }
        j(['data' => $d]);
    }
    if ($g === "/$IG/media" && $m === 'GET') {
        $cur = date('Y-m'); $prev = date('Y-m', strtotime('first day of last month'));
        j(['data' => [
            ['id' => 'm1', 'caption' => 'Aprovados no vestibular! 🎉', 'media_type' => 'IMAGE', 'media_product_type' => 'FEED', 'timestamp' => "$cur-01T10:00:00+0000", 'like_count' => 300, 'comments_count' => 20, 'permalink' => 'https://instagram.com/p/m1'],
            ['id' => 'm2', 'caption' => 'Bastidores da feira', 'media_type' => 'VIDEO', 'media_product_type' => 'REELS', 'timestamp' => "$cur-01T12:00:00+0000", 'like_count' => 900, 'comments_count' => 55, 'permalink' => 'https://instagram.com/reel/m2'],
            ['id' => 'm3', 'caption' => 'Matrículas abertas', 'media_type' => 'IMAGE', 'media_product_type' => 'FEED', 'timestamp' => "$cur-01T15:00:00+0000", 'like_count' => 100, 'comments_count' => 5, 'permalink' => 'https://instagram.com/p/m3'],
            ['id' => 'm0', 'caption' => 'Mês passado', 'media_type' => 'IMAGE', 'media_product_type' => 'FEED', 'timestamp' => "$prev-10T10:00:00+0000", 'like_count' => 50, 'comments_count' => 2, 'permalink' => 'https://instagram.com/p/m0'],
        ]]);
    }
    if ($g === "/$IG/media" && $m === 'POST') {
        $url = $in['image_url'] ?? $in['video_url'] ?? '';
        if ($url === '') j(['error' => ['message' => 'media url required']], 400);
        $ch = curl_init($url); curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]); $body = curl_exec($ch); $st = curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $ct = curl_getinfo($ch, CURLINFO_CONTENT_TYPE); curl_close($ch);
        if ($st !== 200) j(['error' => ['message' => "Meta não conseguiu baixar a mídia (HTTP $st)"]], 400);
        $id = nid('CONT_'); $S['containers'][$id] = ['params' => $in, 'bytes' => strlen((string)$body), 'type' => $ct, 'status' => 'FINISHED'];
        j(['id' => $id]);
    }
    if ($g === "/$IG/media_publish") {
        $c = $in['creation_id'] ?? ''; if (!isset($S['containers'][$c])) j(['error' => ['message' => 'bad creation_id']], 400);
        $id = nid('MEDIA_'); $S['published'][$id] = $c; j(['id' => $id]);
    }
    if (preg_match('#^/(CONT_\d+)$#', $g, $mm)) j(['status_code' => $S['containers'][$mm[1]]['status'] ?? 'ERROR']);
    if (preg_match('#^/(MEDIA_\d+)$#', $g, $mm)) j(['permalink' => 'https://www.instagram.com/p/' . $mm[1] . '/']);
    j(['error' => ['message' => "rota Meta desconhecida $g"]], 404);
}
// ---------------- GOOGLE ----------------
if (str_starts_with($p, '/google')) {
    $g = substr($p, 7);
    if ($g === '/token') {
        if (($in['grant_type'] ?? '') === 'authorization_code') {
            if (($in['code'] ?? '') !== 'GOODCODE') j(['error' => 'invalid_grant', 'error_description' => 'bad code'], 400);
            $pl = rtrim(strtr(base64_encode(json_encode(['email' => 'marketing@colegio.test'])), '+/', '-_'), '=');
            j(['access_token' => 'AT1', 'refresh_token' => 'RT1', 'expires_in' => 3599, 'id_token' => "x.$pl.y"]);
        }
        if (($in['refresh_token'] ?? '') !== 'RT1') j(['error' => 'invalid_grant'], 400);
        j(['access_token' => 'AT' . (++$S['seq']), 'expires_in' => 3599]);
    }
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!str_starts_with($auth, 'Bearer AT')) j(['error' => ['message' => 'unauthorized']], 401);
    $now = gmdate('Y-m-d\TH:i:s.000\Z');
    if ($g === '/calendar/v3/calendars' && $m === 'POST') j(['id' => 'cal1', 'summary' => $in['summary'] ?? '']);
    if ($g === '/calendar/v3/calendars/cal1/events' && $m === 'GET') j(['items' => array_values($S['events'])]);
    if ($g === '/calendar/v3/calendars/cal1/events' && $m === 'POST') { $id = nid('ev'); $in['id'] = $id; $in['updated'] = $now; $in['status'] = 'confirmed'; $S['events'][$id] = $in; j($in); }
    if (preg_match('#^/calendar/v3/calendars/cal1/events/(.+)$#', $g, $mm)) {
        $id = rawurldecode($mm[1]);
        if ($m === 'DELETE') { if (isset($S['events'][$id])) { $S['events'][$id]['status'] = 'cancelled'; $S['events'][$id]['updated'] = $now; } http_response_code(204); exit; }
        if ($m === 'PUT' || $m === 'PATCH') { $in['id'] = $id; $in['updated'] = $now; $in['status'] = 'confirmed'; $S['events'][$id] = $in; j($in); }
    }
    if ($g === '/__edit_event') { }
    if ($g === '/drive/v3/files' && $m === 'GET') {
        preg_match("/name='([^']*)'/", $_GET['q'] ?? '', $nm); $parent = null; if (preg_match("/'([^']+)' in parents/", $_GET['q'] ?? '', $pp)) $parent = $pp[1];
        $r = []; foreach ($S['folders'] as $id => $f) { if ($f['name'] === ($nm[1] ?? '') && ($parent === null || $f['parent'] === $parent)) $r[] = ['id' => $id, 'name' => $f['name']]; }
        j(['files' => $r]);
    }
    if ($g === '/drive/v3/files' && $m === 'POST') { $id = nid('fld'); $S['folders'][$id] = ['name' => $in['name'], 'parent' => $in['parents'][0] ?? null]; j(['id' => $id]); }
    if ($g === '/upload/drive/v3/files' && $m === 'POST') {
        if (!preg_match('/boundary=(.+)$/', $_SERVER['CONTENT_TYPE'] ?? '', $bm)) j(['error' => ['message' => 'no boundary']], 400);
        $parts = explode('--' . trim($bm[1]), $raw); $meta = json_decode(trim(explode("\r\n\r\n", $parts[1], 2)[1] ?? ''), true);
        $bin = $parts[2] ?? ''; $size = strlen(explode("\r\n\r\n", $bin, 2)[1] ?? '') - 2;
        $id = nid('file'); $S['files'][$id] = ['name' => $meta['name'], 'parents' => $meta['parents'], 'size' => $size]; j(['id' => $id, 'webViewLink' => "https://drive.google.com/file/d/$id/view"]);
    }
    if ($g === '/v4/spreadsheets' && $m === 'POST') { $S['sheets'] = ['Sheet1']; j(['spreadsheetId' => 'sheet1', 'spreadsheetUrl' => 'https://docs.google.com/spreadsheets/d/sheet1']); }
    if ($g === '/v4/spreadsheets/sheet1' && $m === 'GET') j(['sheets' => array_map(fn($t) => ['properties' => ['title' => $t]], $S['sheets'])]);
    if ($g === '/v4/spreadsheets/sheet1:batchUpdate') { foreach ($in['requests'] ?? [] as $r) { if (isset($r['addSheet'])) $S['sheets'][] = $r['addSheet']['properties']['title']; } j(['ok' => true]); }
    if (preg_match('#^/v4/spreadsheets/sheet1/values/([^:]+):clear$#', $g, $mm)) { unset($S['values'][rawurldecode($mm[1])]); j([]); }
    if (preg_match('#^/v4/spreadsheets/sheet1/values/(.+)$#', $g, $mm) && $m === 'PUT') { $tab = explode('!', rawurldecode($mm[1]))[0]; $S['values'][$tab] = $in['values'] ?? []; j(['updatedRows' => count($in['values'] ?? [])]); }
    j(['error' => ['message' => "rota Google desconhecida $m $g"]], 404);
}
// utilitários de teste: editar/criar evento "como se fosse no Google"
if ($p === '/__google_edit' && $m === 'POST') { $id = $in['id']; $S['events'][$id] = array_replace_recursive($S['events'][$id], $in['patch']); $S['events'][$id]['updated'] = gmdate('Y-m-d\TH:i:s.000\Z', time() + 5); j($S['events'][$id]); }
if ($p === '/__google_create' && $m === 'POST') { $id = nid('ev'); $in['id'] = $id; $in['status'] = 'confirmed'; $in['updated'] = gmdate('Y-m-d\TH:i:s.000\Z', time() + 5); $S['events'][$id] = $in; j($in); }
j(['error' => 'not found'], 404);

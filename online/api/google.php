<?php
declare(strict_types=1);
/** Google: Agenda (2 vias), Drive (entregas) e Planilhas (relatórios). OAuth 2.0 com refresh token. */

function gUrl(string $key, string $default): string
{
    return rtrim((string)(cfg()[$key] ?? $default), '/');
}
function gConnected(): bool
{
    return setting('g_refresh_token') !== '';
}
function gConnectUrl(): string
{
    if (setting('g_client_id') === '' || setting('g_client_secret') === '') {
        fail(400, 'Informe o Client ID e o Client Secret do Google primeiro.');
    }
    return gUrl('google_auth_url', 'https://accounts.google.com/o/oauth2/v2/auth') . '?' . http_build_query([
        'client_id' => setting('g_client_id'),
        'redirect_uri' => publicUrl() . '/api/integrations/google/callback',
        'response_type' => 'code',
        'scope' => 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets openid email',
        'access_type' => 'offline',
        'prompt' => 'consent',
        'state' => signState('google'),
    ]);
}
function gFinishConnect(string $code): void
{
    $j = (array)httpOk(httpCall('POST', gUrl('google_token_url', 'https://oauth2.googleapis.com/token'), ['Content-Type: application/x-www-form-urlencoded'], http_build_query([
        'code' => $code, 'client_id' => setting('g_client_id'), 'client_secret' => setting('g_client_secret'),
        'redirect_uri' => publicUrl() . '/api/integrations/google/callback', 'grant_type' => 'authorization_code',
    ])), 'Google token');
    if (empty($j['refresh_token'])) {
        throw new RuntimeException('O Google não devolveu o refresh token. Remova o acesso do app em myaccount.google.com/permissions e conecte de novo.');
    }
    setSetting('g_refresh_token', (string)$j['refresh_token']);
    setSetting('g_access_token', (string)($j['access_token'] ?? ''));
    setSetting('g_access_expira', (string)(time() + (int)($j['expires_in'] ?? 3000)));
    if (!empty($j['id_token'])) {
        $pl = json_decode((string)base64_decode(strtr(explode('.', $j['id_token'])[1] ?? '', '-_', '+/')), true);
        setSetting('g_email', (string)($pl['email'] ?? ''));
    }
    intLog('google', 'ok', 'Conectado' . (setting('g_email') ? ' como ' . setting('g_email') : ''));
}
function gToken(): string
{
    if (!gConnected()) {
        throw new RuntimeException('Google não conectado.');
    }
    if (setting('g_access_token') !== '' && (int)setting('g_access_expira', '0') - 60 > time()) {
        return setting('g_access_token');
    }
    $j = (array)httpOk(httpCall('POST', gUrl('google_token_url', 'https://oauth2.googleapis.com/token'), ['Content-Type: application/x-www-form-urlencoded'], http_build_query([
        'client_id' => setting('g_client_id'), 'client_secret' => setting('g_client_secret'),
        'refresh_token' => setting('g_refresh_token'), 'grant_type' => 'refresh_token',
    ])), 'Google renovar acesso');
    setSetting('g_access_token', (string)$j['access_token']);
    setSetting('g_access_expira', (string)(time() + (int)($j['expires_in'] ?? 3000)));
    return (string)$j['access_token'];
}
/** $svc: api | sheets | upload */
function gApi(string $method, string $path, mixed $body = null, string $svc = 'api', array $extraHeaders = []): array
{
    $base = match ($svc) {
        'sheets' => gUrl('google_sheets_base', 'https://sheets.googleapis.com'),
        'upload' => gUrl('google_api_base', 'https://www.googleapis.com'),
        default => gUrl('google_api_base', 'https://www.googleapis.com'),
    };
    $h = array_merge(['Authorization: Bearer ' . gToken()], $extraHeaders);
    $payload = null;
    if ($body !== null) {
        $payload = is_string($body) ? $body : json_encode($body, JSON_UNESCAPED_UNICODE);
        if (!is_string($body)) {
            $h[] = 'Content-Type: application/json';
        }
    }
    [$st, $j] = httpCall($method, $base . $path, $h, $payload, 40);
    if ($method === 'DELETE' && ($st === 204 || $st === 410 || $st === 404)) {
        return [];
    }
    return (array)httpOk([$st, $j], "Google $method $path");
}

// ---------- Agenda ----------
const GCAL_MODULES = ['agenda', 'calendario', 'eventos', 'conteudos', 'tarefas', 'campanhas'];
function gCalendarId(): string
{
    $id = setting('g_calendar_id');
    if ($id !== '') {
        return $id;
    }
    $r = gApi('POST', '/calendar/v3/calendars', ['summary' => 'EVO MKT', 'timeZone' => (string)(cfg()['timezone'] ?? 'America/Recife'), 'description' => 'Calendário sincronizado com o EVO MKT']);
    setSetting('g_calendar_id', (string)$r['id']);
    return (string)$r['id'];
}
/** Converte um registro do EVO em evento do Google (ou null se não tiver data). */
function gEventFromRow(string $mod, array $r): ?array
{
    $tz = (string)(cfg()['timezone'] ?? 'America/Recife');
    $label = ['agenda' => '', 'calendario' => '', 'eventos' => '[Evento] ', 'conteudos' => '[Conteúdo] ', 'tarefas' => '[Tarefa] ', 'campanhas' => '[Campanha] '][$mod] ?? '';
    $title = $label . ($r['titulo'] ?? $r['id']);
    $desc = implode("\n", array_filter(['Status: ' . ($r['status'] ?? '—'), 'Responsável: ' . ($r['responsavel'] ?? '—'), ($r['segmento'] ?? '') ? 'Segmento: ' . $r['segmento'] : '', 'Origem: EVO MKT ' . $r['id']]));
    $ext = ['private' => ['evoModule' => $mod, 'evoId' => $r['id']]];
    $timed = null;
    if (in_array($mod, ['agenda', 'calendario'], true)) {
        $timed = ($r['inicioEm'] ?? '') ?: '';
        $end = ($r['fimEm'] ?? '') ?: '';
    } elseif ($mod === 'conteudos') {
        $timed = ($r['publicacaoEm'] ?? '') ?: '';
        $end = '';
    }
    if ($timed && strlen($timed) >= 16) {
        $s = new DateTimeImmutable($timed, new DateTimeZone($tz));
        $e = $end ? new DateTimeImmutable($end, new DateTimeZone($tz)) : $s->modify('+30 minutes');
        if ($e <= $s) {
            $e = $s->modify('+30 minutes');
        }
        return ['summary' => $title, 'description' => $desc, 'start' => ['dateTime' => $s->format('c'), 'timeZone' => $tz], 'end' => ['dateTime' => $e->format('c'), 'timeZone' => $tz], 'extendedProperties' => $ext];
    }
    $d = $mod === 'tarefas' ? ($r['prazo'] ?? '') : ($r['dataInicio'] ?? ($r['prazo'] ?? ''));
    $d = substr((string)$d, 0, 10);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) {
        return null;
    }
    $endDay = $d;
    if ($mod === 'campanhas' && preg_match('/^\d{4}-\d{2}-\d{2}/', (string)($r['prazo'] ?? '')) && substr($r['prazo'], 0, 10) >= $d) {
        $endDay = substr($r['prazo'], 0, 10);
    }
    return ['summary' => $title, 'description' => $desc, 'start' => ['date' => $d], 'end' => ['date' => date('Y-m-d', strtotime($endDay . ' +1 day'))], 'extendedProperties' => $ext];
}
function gStripLabel(string $s): string
{
    return preg_replace('/^\[(Evento|Conteúdo|Tarefa|Campanha)\]\s*/u', '', $s) ?? $s;
}
/** Aplica no EVO a alteração feita no Google (título e data/hora). */
function gApplyEventToRow(string $mod, array $row, array $ev): array
{
    $patch = ['titulo' => gStripLabel((string)($ev['summary'] ?? $row['titulo'] ?? ''))];
    $startDT = $ev['start']['dateTime'] ?? null;
    $startD = $ev['start']['date'] ?? null;
    $tz = new DateTimeZone((string)(cfg()['timezone'] ?? 'America/Recife'));
    if ($startDT) {
        $s = (new DateTimeImmutable($startDT))->setTimezone($tz);
        $e = isset($ev['end']['dateTime']) ? (new DateTimeImmutable($ev['end']['dateTime']))->setTimezone($tz) : $s->modify('+30 minutes');
        if (in_array($mod, ['agenda', 'calendario'], true)) {
            $patch['inicioEm'] = $s->format('Y-m-d\TH:i');
            $patch['fimEm'] = $e->format('Y-m-d\TH:i');
            $patch['dataInicio'] = $s->format('Y-m-d');
        } elseif ($mod === 'conteudos') {
            $patch['publicacaoEm'] = $s->format('Y-m-d\TH:i');
        } elseif ($mod === 'tarefas') {
            $patch['prazo'] = $s->format('Y-m-d');
        } else {
            $patch['dataInicio'] = $s->format('Y-m-d');
        }
    } elseif ($startD) {
        $patch[$mod === 'tarefas' ? 'prazo' : 'dataInicio'] = $startD;
    }
    return $patch;
}
function gCalendarSync(): array
{
    ensureIntegrationSchema();
    $cal = rawurlencode(gCalendarId());
    $stat = ['do_google' => 0, 'para_google' => 0, 'criados' => 0, 'removidos' => 0];
    $map = [];
    foreach (q('SELECT * FROM google_event_map')->fetchAll() as $m) {
        $map[$m['modulo'] . '|' . $m['id']] = $m;
    }
    $byEvent = [];
    foreach ($map as $m) {
        $byEvent[$m['event_id']] = $m;
    }
    // 1) Google → EVO
    $events = [];
    $page = '';
    do {
        $params = ['maxResults' => 250, 'showDeleted' => 'true', 'singleEvents' => 'true', 'timeMin' => date('c', strtotime('-60 days'))];
        if ($page !== '') {
            $params['pageToken'] = $page;
        }
        $qs = http_build_query($params);
        $r = gApi('GET', "/calendar/v3/calendars/$cal/events?" . $qs);
        foreach ($r['items'] ?? [] as $ev) {
            $events[] = $ev;
        }
        $page = $r['nextPageToken'] ?? '';
    } while ($page !== '');
    foreach ($events as $ev) {
        $evId = (string)$ev['id'];
        $priv = $ev['extendedProperties']['private'] ?? [];
        $known = $byEvent[$evId] ?? null;
        $mod = $priv['evoModule'] ?? ($known['modulo'] ?? null);
        $id = $priv['evoId'] ?? ($known['id'] ?? null);
        if (($ev['status'] ?? '') === 'cancelled') {
            if ($known) {
                q('DELETE FROM google_event_map WHERE modulo=? AND id=?', [$known['modulo'], $known['id']]);
                unset($map[$known['modulo'] . '|' . $known['id']]);
                intLog('google', 'ok', "Evento removido no Google; item {$known['id']} mantido no EVO");
            }
            continue;
        }
        if ($mod && $id && in_array($mod, GCAL_MODULES, true)) {
            $row = getRow($mod, $id);
            if (!$row) {
                continue;
            }
            $mine = gEventFromRow($mod, $row);
            $hash = $mine ? md5(json_encode($mine)) : '';
            $mapped = $map["$mod|$id"] ?? null;
            $gUpdated = strtotime((string)($ev['updated'] ?? '1970-01-01'));
            $rUpdated = strtotime((string)($row['atualizadoEm'] ?? '1970-01-01'));
            // alterado no Google depois do último envio e depois da última edição no EVO
            $theirs = md5(json_encode(gEventFromRow($mod, array_merge($row, gApplyEventToRow($mod, $row, $ev))) ?? []));
            if ($mapped && $theirs !== $mapped['hash'] && $theirs !== $hash && $gUpdated > $rUpdated) {
                updateRow($mod, $id, gApplyEventToRow($mod, $row, $ev), 'integracao:google');
                $stat['do_google']++;
                $row = getRow($mod, $id);
                $newHash = md5(json_encode(gEventFromRow($mod, $row) ?? []));
                q('UPDATE google_event_map SET hash=? WHERE modulo=? AND id=?', [$newHash, $mod, $id]);
                $map["$mod|$id"]['hash'] = $newHash;
            }
        } elseif (!$known && !empty($ev['start'])) {
            $patch = gApplyEventToRow('calendario', [], $ev);
            $new = insertRow('calendario', $patch + ['status' => 'NOVO', 'origem' => 'GOOGLE_AGENDA', 'idExterno' => $evId, 'descricao' => (string)($ev['description'] ?? '')], 'integracao:google');
            $h = md5(json_encode(gEventFromRow('calendario', $new) ?? []));
            q('INSERT INTO google_event_map(modulo,id,event_id,hash) VALUES(?,?,?,?)', ['calendario', $new['id'], $evId, $h]);
            $map['calendario|' . $new['id']] = ['modulo' => 'calendario', 'id' => $new['id'], 'event_id' => $evId, 'hash' => $h];
            $stat['criados']++;
        }
    }
    // 2) EVO → Google
    $seen = [];
    foreach (GCAL_MODULES as $mod) {
        foreach (listRows($mod) as $r) {
            if (preg_match('/CONCLU|CANCEL|ARQUIV/i', (string)($r['status'] ?? '')) && $mod === 'tarefas') {
                continue;
            }
            $ev = gEventFromRow($mod, $r);
            $key = $mod . '|' . $r['id'];
            if (!$ev) {
                continue;
            }
            $seen[$key] = true;
            $h = md5(json_encode($ev));
            if (!isset($map[$key])) {
                $res = gApi('POST', "/calendar/v3/calendars/$cal/events", $ev);
                q('INSERT INTO google_event_map(modulo,id,event_id,hash) VALUES(?,?,?,?)', [$mod, $r['id'], $res['id'], $h]);
                $stat['para_google']++;
            } elseif ($map[$key]['hash'] !== $h) {
                gApi('PUT', "/calendar/v3/calendars/$cal/events/" . rawurlencode($map[$key]['event_id']), $ev);
                q('UPDATE google_event_map SET hash=? WHERE modulo=? AND id=?', [$h, $mod, $r['id']]);
                $stat['para_google']++;
            }
        }
    }
    // 3) item apagado/concluído no EVO → remove o evento
    foreach ($map as $key => $m) {
        if (isset($seen[$key])) {
            continue;
        }
        $row = getRow($m['modulo'], $m['id']);
        $gone = !$row || ($m['modulo'] === 'tarefas' && preg_match('/CONCLU|CANCEL|ARQUIV/i', (string)($row['status'] ?? '')));
        $noDate = $row && !gEventFromRow($m['modulo'], $row);
        if ($gone || $noDate) {
            gApi('DELETE', "/calendar/v3/calendars/$cal/events/" . rawurlencode($m['event_id']));
            q('DELETE FROM google_event_map WHERE modulo=? AND id=?', [$m['modulo'], $m['id']]);
            $stat['removidos']++;
        }
    }
    setSetting('g_last_cal_sync', now());
    intLog('google', 'ok', 'Agenda sincronizada: ' . json_encode($stat));
    return $stat;
}

// ---------- Drive ----------
function gDriveFolder(string $name, string $parent = ''): string
{
    $q = "mimeType='application/vnd.google-apps.folder' and trashed=false and name='" . str_replace("'", "\\'", $name) . "'" . ($parent ? " and '$parent' in parents" : '');
    $r = gApi('GET', '/drive/v3/files?' . http_build_query(['q' => $q, 'fields' => 'files(id,name)', 'spaces' => 'drive']));
    if (!empty($r['files'][0]['id'])) {
        return (string)$r['files'][0]['id'];
    }
    $meta = ['name' => $name, 'mimeType' => 'application/vnd.google-apps.folder'] + ($parent ? ['parents' => [$parent]] : []);
    return (string)gApi('POST', '/drive/v3/files?fields=id', $meta)['id'];
}
function gDriveRoot(): string
{
    $id = setting('g_drive_folder_id');
    if ($id === '') {
        $id = gDriveFolder('EVO MKT — Entregas');
        setSetting('g_drive_folder_id', $id);
    }
    return $id;
}
/** Envia um arquivo do servidor ao Drive dentro da pasta da solicitação. Retorna o link. */
function gDriveUpload(string $localPath, string $solId, string $solTitulo): string
{
    $sub = gDriveFolder($solId . ' — ' . mb_substr($solTitulo, 0, 60), gDriveRoot());
    $name = basename($localPath);
    $b = 'evo' . bin2hex(random_bytes(8));
    $mime = mime_content_type($localPath) ?: 'application/octet-stream';
    $body = "--$b\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" . json_encode(['name' => $name, 'parents' => [$sub]], JSON_UNESCAPED_UNICODE) . "\r\n--$b\r\nContent-Type: $mime\r\n\r\n" . file_get_contents($localPath) . "\r\n--$b--";
    $r = gApi('POST', '/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', $body, 'upload', ["Content-Type: multipart/related; boundary=$b"]);
    return (string)($r['webViewLink'] ?? ('https://drive.google.com/file/d/' . $r['id'] . '/view'));
}
/** Envia ao Drive os arquivos de ENTREGA da solicitação que ainda não foram. Retorna nº de arquivos. */
function gDriveSendEntregas(string $solId): int
{
    $r = getRow('solicitacoes', $solId) ?? throw new RuntimeException("Solicitação $solId não encontrada.");
    $done = array_filter(array_map('trim', explode('|', (string)($r['entregaDriveLinks'] ?? ''))));
    $sent = array_filter(array_map('trim', explode('|', (string)($r['entregaDriveEnviados'] ?? ''))));
    $n = 0;
    foreach (array_filter(array_map('trim', explode('|', (string)($r['arquivosEntrega'] ?? '')))) as $rel) {
        if (in_array($rel, $sent, true)) {
            continue;
        }
        $fp = realpath(__DIR__ . '/../storage/' . $rel);
        if (!$fp || !is_file($fp)) {
            continue;
        }
        $done[] = gDriveUpload($fp, $solId, (string)($r['titulo'] ?? ''));
        $sent[] = $rel;
        $n++;
    }
    if ($n) {
        updateRow('solicitacoes', $solId, ['entregaDriveLinks' => implode(' | ', $done), 'entregaDriveEnviados' => implode(' | ', $sent)], 'integracao:google');
        intLog('google', 'ok', "Drive: $n arquivo(s) de $solId enviados");
    }
    return $n;
}

// ---------- Planilhas ----------
const GSHEET_DEFAULT_MODULES = ['tarefas', 'conteudos', 'solicitacoes', 'campanhas', 'eventos', 'instagram', 'trafego'];
function gSheetId(): string
{
    $id = setting('g_sheet_id');
    if ($id !== '') {
        return $id;
    }
    $r = gApi('POST', '/v4/spreadsheets', ['properties' => ['title' => 'EVO MKT — Relatórios (automático)']], 'sheets');
    setSetting('g_sheet_id', (string)$r['spreadsheetId']);
    setSetting('g_sheet_url', (string)($r['spreadsheetUrl'] ?? ''));
    return (string)$r['spreadsheetId'];
}
function gSheetsExport(): array
{
    $id = gSheetId();
    $mods = array_values(array_filter(explode(',', setting('g_sheet_modules', implode(',', GSHEET_DEFAULT_MODULES))), fn($m) => isset(MODULES[trim($m)])));
    $meta = gApi('GET', "/v4/spreadsheets/$id?fields=sheets.properties.title", null, 'sheets');
    $have = array_map(fn($s) => $s['properties']['title'], $meta['sheets'] ?? []);
    $add = [];
    foreach ($mods as $m) {
        if (!in_array($m, $have, true)) {
            $add[] = ['addSheet' => ['properties' => ['title' => $m]]];
        }
    }
    if ($add) {
        gApi('POST', "/v4/spreadsheets/$id:batchUpdate", ['requests' => $add], 'sheets');
    }
    $out = [];
    foreach ($mods as $m) {
        $m = trim($m);
        $headers = headersOf($m);
        $rows = array_slice(listRows($m), 0, 5000);
        $vals = [$headers];
        foreach ($rows as $r) {
            $vals[] = array_map(fn($h) => (string)($r[$h] ?? ''), $headers);
        }
        gApi('POST', "/v4/spreadsheets/$id/values/" . rawurlencode($m) . ':clear', new stdClass(), 'sheets');
        gApi('PUT', "/v4/spreadsheets/$id/values/" . rawurlencode($m . '!A1') . '?valueInputOption=RAW', ['range' => $m . '!A1', 'majorDimension' => 'ROWS', 'values' => $vals], 'sheets');
        $out[$m] = count($rows);
    }
    setSetting('g_last_sheet_export', now());
    intLog('google', 'ok', 'Planilha atualizada: ' . json_encode($out));
    return $out;
}

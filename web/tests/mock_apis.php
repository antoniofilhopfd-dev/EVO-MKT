<?php
// Servidor SIMULADO da Meta (Graph API) e do Google — somente para testes. Uso: php -S 127.0.0.1:8099 tests/mock_apis.php
date_default_timezone_set(getenv('TIMEZONE') ?: 'America/Recife'); // mesmo fuso do sistema (senão as datas viram o dia seguinte à noite)
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
    $tok = $_GET['access_token'] ?? ($in['access_token'] ?? ($_POST['access_token'] ?? ''));
    $IG = '17841400000000000'; $IG2 = '17841499999999999'; $is2 = false;
    if (str_starts_with($g, "/$IG2")) { $g = "/$IG" . substr($g, strlen("/$IG2")); $is2 = true; }
    if ($g === '/oauth/access_token') {
        if (($_GET['grant_type'] ?? '') === 'fb_exchange_token') { if (($_GET['client_secret'] ?? '') !== 'META_SECRET') j(['error' => ['message' => 'bad secret']], 400); j(['access_token' => 'LONG_TOKEN', 'expires_in' => 5184000]); }
        if (($_GET['code'] ?? '') !== 'GOODCODE') j(['error' => ['message' => 'Invalid verification code']], 400);
        j(['access_token' => 'SHORT_TOKEN']);
    }
    if ($tok === '') j(['error' => ['message' => 'Missing access token']], 401);
    if ($tok === 'EXPIRED_TOKEN') j(['error' => ['message' => 'Error validating access token: Session has expired', 'type' => 'OAuthException', 'code' => 190]], 400);
    if ($g === '/me/permissions') { $all = ['instagram_basic', 'instagram_manage_insights', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement', 'business_management', 'ads_read', 'ads_management']; $d = []; foreach ($all as $x) { $d[] = ['permission' => $x, 'status' => (($tok === 'LIMITED_TOKEN' && $x === 'instagram_content_publish') || ($tok === 'NOADS_TOKEN' && $x === 'ads_read') || ($tok === 'NOMGMT_TOKEN' && $x === 'ads_management')) ? 'declined' : 'granted']; } j(['data' => $d]); }
    if ($g === '/search' && ($_GET['type'] ?? '') === 'adinterest') j(['data' => [['id' => '6003107902433', 'name' => 'Educação infantil', 'audience_size_upper_bound' => 1200000], ['id' => '6003020834693', 'name' => 'Ensino médio', 'audience_size_upper_bound' => 800000]]]);
    if ($g === '/act_111222333/adimages' && $m === 'POST') { $S['imagens_enviadas'][] = strlen($in['bytes'] ?? ''); j(['images' => ['arte.jpg' => ['hash' => 'HASH_IMG_1']]]); }
    if ($g === '/act_111222333/advideos' && $m === 'POST') { $S['videos_enviados'][] = $_FILES['source']['size'] ?? 0; j(['id' => 'VID_1']); }
    if ($g === '/VID_1/thumbnails') j(['data' => [['uri' => 'https://scontent.example/thumb.jpg', 'is_preferred' => true]]]);
    if ($g === '/VID_1') j(['id' => 'VID_1', 'status' => ['video_status' => 'ready']]);
    if ($g === '/act_111222333/adspixels') j(['data' => [['id' => 'PX1', 'name' => 'Pixel do site', 'last_fired_time' => '2026-10-22T10:00:00+0000', 'is_unavailable' => false]]]);
    if ($g === '/PX1/stats') j(['data' => [['aggregation' => 'event', 'data' => [['value' => 'PageView', 'count' => 120], ['value' => 'Lead', 'count' => 3]]]]]);
    if ($g === '/BIZ1/owned_product_catalogs') j(['data' => [['id' => 'CAT1', 'name' => 'Catálogo de cursos', 'product_count' => 12, 'vertical' => 'commerce']]]);
    if ($g === '/BIZ1/ad_studies' && $m === 'POST') { $id = nid('STUDY_'); $S['estudos'][$id] = $in + ['id' => $id]; j(['id' => $id]); }
    if ($g === '/BIZ1/ad_studies') {
        $out = [];
        foreach (($S['estudos'] ?? []) as $e) {
            $cells = [];
            foreach (json_decode($e['cells'], true) as $c) {
                $itens = [];
                foreach (($c['adsets'] ?? []) as $i) $itens[] = ['id' => $i, 'name' => 'Conjunto ' . $i];
                $cells[] = ['name' => $c['name'], 'treatment_percentage' => $c['treatment_percentage'], 'adsets' => ['data' => $itens]];
            }
            $out[] = ['id' => $e['id'], 'name' => $e['name'], 'type' => 'SPLIT_TEST', 'description' => $e['description'] ?? '', 'start_time' => (int)$e['start_time'], 'end_time' => (int)$e['end_time'], 'cells' => ['data' => $cells]];
        }
        j(['data' => $out]);
    }

    if ($g === '/act_111222333/customaudiences' && $m === 'POST') { $id = nid('CA_'); $S['publicos_novos'][$id] = $in; j(['id' => $id]); }
    if (preg_match('#^/(CA_\w+|CA1)/users$#', $g, $mm) && $m === 'POST') { $S['publicos_usuarios'][$mm[1]][] = json_decode($in['payload'] ?? '{}', true); j(['audience_id' => $mm[1], 'num_received' => 1]); }
    if (preg_match('#^/(CA_\w+|CA1)$#', $g, $mm) && $m === 'DELETE') { $S['publicos_excluidos'][] = $mm[1]; j(['success' => true]); }
    if (preg_match('#^/(CA_\w+|CA1)$#', $g, $mm) && $m === 'POST') { $S['publicos_edits'][$mm[1]][] = $in; j(['success' => true]); }
    if ($g === '/act_111222333/customaudiences') j(['data' => [['id' => 'CA1', 'name' => 'Visitantes do site']]]);
    if ($g === '/p1/leadgen_forms') j(['data' => [['id' => 'LF1', 'name' => 'Matrículas 2027', 'status' => 'ACTIVE'], ['id' => 'LF2', 'name' => 'Antigo', 'status' => 'ARCHIVED']]]);
    if ($g === '/search') { $qq = $_GET['q'] ?? ''; j(['data' => str_contains($qq, 'Naolandia') ? [] : [['key' => '2430536', 'name' => $qq === '' ? 'Cidade' : (str_contains($qq, 'Jo') ? 'João Pessoa' : $qq), 'region' => 'Paraíba', 'country_code' => 'BR']]]); }
    if ($g === '/act_111222333/campaigns' && $m === 'POST') { $id = nid('CAMP_'); $S['ads_novos'][$id] = ['tipo' => 'campanha', 'params' => $in, 'status' => $in['status'] ?? '']; j(['id' => $id]); }
    if ($g === '/act_111222333/adsets' && $m === 'POST') { if ($tok === 'FAILSET_TOKEN') j(['error' => ['message' => 'Invalid parameter: destination_type']], 400); $id = nid('SET_'); $S['ads_novos'][$id] = ['tipo' => 'conjunto', 'params' => $in, 'status' => $in['status'] ?? '']; j(['id' => $id]); }
    if ($g === '/act_111222333/adcreatives' && $m === 'POST') { $id = nid('CRE_'); $S['ads_novos'][$id] = ['tipo' => 'criativo', 'params' => $in]; j(['id' => $id]); }
    if ($g === '/act_111222333/ads' && $m === 'POST') { $id = nid('AD_'); $S['ads_novos'][$id] = ['tipo' => 'anuncio', 'params' => $in, 'status' => $in['status'] ?? '']; j(['id' => $id]); }
    if (preg_match('#^/([A-Za-z]+_\d+|[csa]\d+)/copies$#', $g, $mm) && $m === 'POST') { $S['copias'][] = [$mm[1], $in]; if ($tok === 'NOCOPY_TOKEN') j(['error' => ['message' => 'copy not allowed']], 400); j(['copied_campaign_id' => nid('CAMP_'), 'ad_object_ids' => []]); }
    if (preg_match('#^/(OUTRA_1|[csa]\d+|(CAMP|SET|AD)_\d+)$#', $g, $mm)) {
        $oid = $mm[1];
        if ($m === 'POST') { if ($tok === 'NOEDIT_TOKEN') j(['error' => ['message' => 'Permissions error']], 400); $S['edits'][$oid][] = $in; if (isset($in['status']) && isset($S['ads_novos'][$oid])) { $S['ads_novos'][$oid]['status'] = $in['status']; $S['ads_novos'][$oid]['mudancas'][] = $in['status']; } j(['success' => true]); }
        $base = ['OUTRA_1' => ['name' => 'De outra conta', 'account_id' => '999'], 'c1' => ['name' => 'Matrículas 2027', 'status' => 'PAUSED', 'daily_budget' => '5000'], 's1' => ['name' => 'Conjunto matrículas', 'status' => 'ACTIVE', 'daily_budget' => '5000', 'bid_strategy' => 'LOWEST_COST_WITHOUT_CAP', 'end_time' => '2026-12-01T00:00:00-0300', 'targeting' => ['age_min' => 25, 'age_max' => 55, 'geo_locations' => ['cities' => [['key' => '2430536', 'name' => 'João Pessoa', 'radius' => 15, 'distance_unit' => 'kilometer']]]]], 'a1' => ['name' => 'Vídeo depoimento', 'status' => 'ACTIVE']][$oid] ?? ['name' => $S['ads_novos'][$oid]['params']['name'] ?? $oid, 'status' => $S['ads_novos'][$oid]['status'] ?? 'ACTIVE'];
        $ex = [];
        if ($oid === 'c1') $ex = ['objective' => 'OUTCOME_ENGAGEMENT'];
        if ($oid === 'a1') $ex = ['creative' => ['id' => 'CR1', 'name' => 'Criativo do vídeo', 'instagram_user_id' => 'ig1', 'object_story_spec' => ['page_id' => 'p1', 'link_data' => ['message' => 'Texto antigo', 'name' => 'Título antigo', 'link' => 'https://colegio.example/matricula', 'call_to_action' => ['type' => 'LEARN_MORE', 'value' => ['link' => 'https://colegio.example/matricula']]]]]];
        if ($oid === 's1') $ex = ['optimization_goal' => 'CONVERSATIONS', 'destination_type' => 'INSTAGRAM_DIRECT', 'campaign' => ['id' => 'c1', 'objective' => 'OUTCOME_ENGAGEMENT', 'name' => 'Matrículas 2027']];
        if (isset($S['ads_novos'][$oid])) { $nv = $S['ads_novos'][$oid]; $pp = $nv['params'] ?? [];
            if ($nv['tipo'] === 'campanha') $ex = ['objective' => $pp['objective'] ?? ''];
            if ($nv['tipo'] === 'conjunto') { $cp = $S['ads_novos'][$pp['campaign_id'] ?? ''] ?? null; $ex = ['optimization_goal' => $pp['optimization_goal'] ?? '', 'destination_type' => $pp['destination_type'] ?? '', 'campaign' => ['id' => $pp['campaign_id'] ?? '', 'objective' => $cp['params']['objective'] ?? 'OUTCOME_ENGAGEMENT', 'name' => $cp['params']['name'] ?? '']]; } }
        j($base + $ex + ['id' => $oid, 'account_id' => '111222333']);
    }
    if (preg_match('#^/(CAMP_\d+)$#', $g, $mm) && $m === 'POST') { $S['ads_novos'][$mm[1]]['status'] = $in['status'] ?? ''; $S['ads_novos'][$mm[1]]['mudancas'][] = $in['status'] ?? ''; j(['success' => true]); }
    if ($g === '/me/adaccounts') j(['data' => [['account_id' => '111222333', 'name' => 'Conta Colégio', 'currency' => 'BRL', 'account_status' => 1], ['account_id' => '999', 'name' => 'Outra conta', 'currency' => 'USD', 'account_status' => 1]]]);
    if ($g === '/act_111222333/campaigns') j(['data' => [['id' => 'c1', 'name' => 'Matrículas 2027', 'start_time' => '2026-09-01T09:00:00-0300', 'status' => 'PAUSED', 'effective_status' => ($tok === 'STATUS_TOKEN' ? 'WITH_ISSUES' : 'PAUSED'), 'objective' => 'OUTCOME_LEADS', 'daily_budget' => '5000'], ['id' => 'c2', 'name' => 'Open day', 'status' => 'ACTIVE', 'effective_status' => 'ACTIVE', 'objective' => 'OUTCOME_ENGAGEMENT', 'daily_budget' => '2000'], ['id' => 'c3', 'name' => 'Boost do cartaz', 'status' => 'ACTIVE', 'effective_status' => 'ACTIVE', 'objective' => 'OUTCOME_TRAFFIC', 'daily_budget' => '1000'], ['id' => 'c4', 'name' => 'Captação de leads', 'status' => 'ACTIVE', 'effective_status' => 'ACTIVE', 'objective' => 'OUTCOME_LEADS', 'daily_budget' => '3000']]]);
    if (preg_match('#^/([csa]\d+)/insights$#', $g)) {
        $bd = $_GET['breakdowns'] ?? '';
        if ($bd === 'age') j(['data' => [['age' => '25-34', 'spend' => '400', 'impressions' => '30000', 'reach' => '15000', 'clicks' => '700', 'actions' => [['action_type' => 'onsite_conversion.messaging_conversation_started_7d', 'value' => '9']]], ['age' => '35-44', 'spend' => '300', 'impressions' => '20000', 'reach' => '10000', 'clicks' => '400', 'actions' => []]]]);
        if ($bd !== '') j(['data' => [[$bd => 'instagram', 'spend' => '500', 'impressions' => '40000', 'reach' => '20000', 'clicks' => '900', 'actions' => []]]]);
        if (isset($_GET['time_increment'])) j(['data' => [['date_start' => date('Y-m-d', strtotime('-2 day')), 'spend' => '10', 'impressions' => '1000', 'reach' => '800', 'clicks' => '20', 'actions' => []]]]);
        j(['data' => []]);
    }
    if (preg_match('#^/([a]\d+)/previews$#', $g)) j(['data' => [['body' => '<iframe src="https://www.facebook.com/ads/api/preview_iframe.php?d=abc&amp;t=1" width="320" height="540"></iframe>']]]);
    if ($g === '/act_111222333/activities') j(['data' => [['event_time' => '2026-10-17T12:00:00+0000', 'actor_name' => 'Maria Gestora', 'event_type' => 'update_campaign_budget', 'translated_event_type' => 'Orçamento da campanha atualizado', 'object_name' => 'Matrículas 2027', 'object_type' => 'CAMPAIGN']]]);
    if ($g === '/act_111222333' && $m === 'GET') j(['business' => ['id' => 'BIZ1'], 'account_status' => ($tok === 'BADACCT_TOKEN' ? 3 : 1), 'spend_cap' => '1000000', 'amount_spent' => '950000', 'balance' => '12345', 'name' => 'Conta Colégio', 'timezone_name' => 'America/Fortaleza', 'currency' => 'BRL', 'funding_source_details' => ['display_string' => 'Visa 4242']]);
    if ($g === '/act_111222333/adsets') j(['data' => [
        ['id' => 's1', 'name' => 'Conjunto matrículas', 'campaign_id' => 'c1', 'status' => 'ACTIVE', 'effective_status' => 'CAMPAIGN_PAUSED', 'daily_budget' => '5000', 'optimization_goal' => 'LEAD_GENERATION', 'destination_type' => 'ON_AD', 'targeting' => ['age_min' => 25, 'age_max' => 55, 'geo_locations' => ['cities' => [['key' => '2430536', 'name' => 'João Pessoa', 'radius' => 15, 'distance_unit' => 'kilometer']]], 'publisher_platforms' => ['instagram']]],
        ['id' => 's2', 'name' => 'Conjunto open day', 'campaign_id' => 'c2', 'status' => 'ACTIVE', 'effective_status' => 'ACTIVE', 'daily_budget' => '2000', 'optimization_goal' => 'POST_ENGAGEMENT', 'destination_type' => 'ON_POST', 'targeting' => ['age_min' => 18, 'age_max' => 65]]]]);
    if ($g === '/act_111222333/insights' && ($_GET['level'] ?? '') === 'adset') j(['data' => [
        ['adset_id' => 's1', 'spend' => '1234.56', 'impressions' => '90000', 'reach' => '41000', 'clicks' => '2100', 'actions' => [['action_type' => 'lead', 'value' => '35']]],
        ['adset_id' => 's2', 'spend' => '300.00', 'impressions' => '20000', 'reach' => '15000', 'clicks' => '500', 'actions' => [['action_type' => 'post_engagement', 'value' => '800']]]]]);
    if ($g === '/act_111222333/ads') j(['data' => [['id' => 'a1', 'name' => 'Vídeo depoimento', 'adset_id' => 's1', 'campaign_id' => 'c1', 'status' => 'ACTIVE', 'effective_status' => 'ACTIVE', 'created_time' => '2026-09-20T10:00:00+0000', 'creative' => ['thumbnail_url' => 'https://scontent.fbcdn.net/a1.jpg', 'title' => 'Matrículas abertas', 'body' => 'Conheça a escola que acolhe.', 'call_to_action_type' => 'LEARN_MORE', 'object_type' => 'VIDEO', 'instagram_permalink_url' => 'https://www.instagram.com/p/xyz/', 'object_story_spec' => ['page_id' => 'p1', 'instagram_actor_id' => '17841400000000000', 'video_data' => ['message' => 'Texto do vídeo', 'call_to_action' => ['type' => 'LEARN_MORE', 'value' => ['link' => 'https://evolucao.test/matriculas']]]]]], ['id' => 'a2', 'name' => 'Carrossel valores', 'adset_id' => 's1', 'campaign_id' => 'c1', 'status' => 'ACTIVE', 'effective_status' => 'ACTIVE', 'creative' => ['thumbnail_url' => 'http://inseguro.example/a2.jpg']], ['id' => 'a3', 'name' => 'Cartaz antigo', 'adset_id' => 's2', 'campaign_id' => 'c3', 'status' => ($tok === 'PAUSEDAD_TOKEN' ? 'PAUSED' : 'ACTIVE'), 'effective_status' => 'DISAPPROVED', 'issues_info' => [['error_summary' => 'Texto da imagem acima do permitido']]]]]);
    if ($g === '/act_111222333/insights' && ($_GET['level'] ?? '') === 'ad') j(['data' => [
        ['ad_id' => 'a1', 'ad_name' => 'Vídeo depoimento', 'campaign_id' => 'c1', 'campaign_name' => '01 - EI | Matrículas 2027', 'spend' => '600.00', 'impressions' => '40000', 'reach' => '20000', 'clicks' => '1200', 'account_currency' => 'BRL', 'actions' => [['action_type' => 'lead', 'value' => '30']]],
        ['ad_id' => 'a2', 'ad_name' => 'Carrossel valores', 'campaign_id' => 'c1', 'campaign_name' => '01 - EI | Matrículas 2027', 'spend' => '634.56', 'impressions' => '50000', 'reach' => '21000', 'clicks' => '900', 'account_currency' => 'BRL', 'actions' => [['action_type' => 'onsite_conversion.messaging_conversation_started_7d', 'value' => '8']]],
        ['ad_id' => 'a3', 'ad_name' => 'Cartaz antigo', 'campaign_name' => 'Boost do cartaz', 'spend' => '150.00', 'impressions' => '5000', 'reach' => '1200', 'clicks' => '20', 'account_currency' => 'BRL'],
    ]]);
    if ($g === '/act_111222333/insights' && ($_GET['level'] ?? '') === 'account') { $d = []; for ($i = 9; $i >= 0; $i--) { $d[] = ['date_start' => date('Y-m-d', strtotime("-$i day")), 'spend' => ($tok === 'STOPPED_TOKEN' && $i < 4 ? '0' : (string)(80 + $i)), 'impressions' => '3000', 'clicks' => '70', 'account_currency' => 'BRL', 'actions' => [['action_type' => 'lead', 'value' => (string)($i % 3)], ['action_type' => 'onsite_conversion.messaging_conversation_started_7d', 'value' => (string)(2 + $i % 2)]]]; } j(['data' => $d]); }
    if ($g === '/act_111222333/insights' && ($_GET['level'] ?? '') === 'campaign' && isset($_GET['time_increment'])) {
        $tr = json_decode($_GET['time_range'] ?? '{}', true); $d = []; $camps = ['c1' => '01 - EI | Matrículas 2027', 'c2' => '02 - AF | Open day', 'c3' => '03 - EM | Boost'];
        for ($t = strtotime($tr['since']); $t <= strtotime($tr['until']); $t += 86400) { $k = 0; foreach ($camps as $cid => $cn) { $k++; $d[] = ['campaign_id' => $cid, 'campaign_name' => $cn, 'date_start' => date('Y-m-d', $t), 'spend' => (string)(10 * $k + (int)date('j', $t) % 5), 'account_currency' => 'BRL']; } }
        j(['data' => $d]);
    }
    if ($g === '/act_111222333/insights') {
        $since = json_decode($_GET['time_range'] ?? '{}', true)['since'] ?? '';
        j(['data' => [
            ['campaign_id' => 'c1', 'campaign_name' => '01 - EI | Matrículas 2027', 'spend' => '1234.56', 'impressions' => '90000', 'reach' => '41000', 'clicks' => '2100', 'account_currency' => 'BRL', 'actions' => [['action_type' => 'lead', 'value' => '35'], ['action_type' => 'onsite_conversion.messaging_conversation_started_7d', 'value' => '20'], ['action_type' => 'link_click', 'value' => '2000']]],
            ['campaign_id' => 'c2', 'campaign_name' => 'Open day', 'spend' => '300.00', 'impressions' => '20000', 'reach' => '15000', 'clicks' => '500', 'account_currency' => 'BRL'],
            ['campaign_id' => 'c3', 'campaign_name' => 'Boost do cartaz', 'spend' => '150.00', 'impressions' => '5000', 'reach' => '1200', 'clicks' => '20', 'account_currency' => 'BRL'],
            ['campaign_id' => 'c4', 'campaign_name' => 'Captação de leads', 'spend' => '400.00', 'impressions' => '12000', 'reach' => '9000', 'clicks' => '300', 'account_currency' => 'BRL'],
        ], 'since' => $since]);
    }
    if ($g === '/me/accounts') { $d = [['name' => 'Colégio Evolução', 'id' => 'p1', 'instagram_business_account' => ['id' => $IG, 'username' => 'evolucaopb']]]; if ($tok === 'MULTI_TOKEN' || $tok === 'DUAL_TOKEN') $d[] = ['name' => 'Outra Página', 'id' => 'p2', 'instagram_business_account' => ['id' => '17841499999999999', 'username' => 'outraconta']]; j(['data' => $d]); }
    if ($g === "/$IG") j($is2 ? ['followers_count' => 1300, 'follows_count' => 50, 'media_count' => 40, 'username' => 'outraconta'] : ['followers_count' => 4600, 'follows_count' => 120, 'media_count' => 310, 'username' => 'evolucaopb']);
    if ($g === "/$IG/insights") {
        if ($tok === 'NOVIEWS_TOKEN' && str_contains($_GET['metric'] ?? '', ',') ) j(['error' => ['message' => 'metric views is deprecated']], 400);
        if ($tok === 'NOVIEWS_TOKEN' && ($_GET['metric'] ?? '') === 'views') j(['error' => ['message' => 'metric views is deprecated']], 400);
        $vals = ['reach' => 18000, 'views' => 26000, 'profile_views' => 1100, 'total_interactions' => 2300, 'likes' => 1500, 'comments' => 200, 'shares' => 110, 'saves' => 490];
        $d = []; foreach (explode(',', $_GET['metric'] ?? '') as $k) { $d[] = ['name' => $k, 'period' => 'day', 'total_value' => ['value' => $vals[$k] ?? 0]]; }
        j(['data' => $d]);
    }
    if (preg_match('#^/(m[0-9]|n[0-9])/insights$#', $g) && $tok === 'NOVIEWS_TOKEN' && in_array(($_GET['metric'] ?? ''), ['views', 'follows', 'profile_visits'])) j(['error' => ['message' => '(#100) The ' . ($_GET['metric'] ?? '') . ' metric is not supported for this media']], 400);
    if (preg_match('#^/(m[0-9]|n[0-9])/insights$#', $g, $mm) && in_array(($_GET['metric'] ?? ''), ['follows', 'profile_visits'])) { $mt = $_GET['metric']; $tab = ['follows' => ['n1' => 3, 'n2' => 1, 'm1' => 14, 'm2' => 85, 'm3' => 6, 'm0' => 2], 'profile_visits' => ['n1' => 20, 'n2' => 9, 'm1' => 120, 'm2' => 640, 'm3' => 40, 'm0' => 15]]; j(['data' => [['name' => $mt, 'values' => [['value' => $tab[$mt][$mm[1]] ?? 0]]]]]); }
    if (preg_match('#^/(m[0-9]|n[0-9])/insights$#', $g, $mm) && ($_GET['metric'] ?? '') === 'views') { $vv = ['n1' => 1500, 'n2' => 800, 'm1' => 9000, 'm2' => 52000, 'm3' => 3000, 'm0' => 2000][$mm[1]] ?? 0; j(['data' => [['name' => 'views', 'values' => [['value' => $vv]]]]]); }
    if (preg_match('#^/(m[0-9]|n[0-9])/insights$#', $g, $mm)) { $b = ['n1' => [700, 9, 3], 'n2' => [300, 2, 1], 'm1' => [4000, 30, 12], 'm2' => [20000, 80, 40], 'm3' => [1500, 5, 2], 'm0' => [900, 3, 1]][$mm[1]] ?? [0, 0, 0]; j(['data' => [['name' => 'reach', 'values' => [['value' => $b[0]]]], ['name' => 'saved', 'values' => [['value' => $b[1]]]], ['name' => 'shares', 'values' => [['value' => $b[2]]]]]]); }
    if ($g === "/$IG/media" && $m === 'GET' && $is2) {
        $cur = date('Y-m');
        j(['data' => [
            ['id' => 'n1', 'caption' => 'Geração Evolução: ensaio', 'media_type' => 'IMAGE', 'media_product_type' => 'FEED', 'timestamp' => "$cur-02T10:00:00+0000", 'like_count' => 60, 'comments_count' => 4, 'permalink' => 'https://instagram.com/p/n1'],
            ['id' => 'n2', 'caption' => 'Bastidores do coral', 'media_type' => 'VIDEO', 'media_product_type' => 'REELS', 'timestamp' => "$cur-03T12:00:00+0000", 'like_count' => 20, 'comments_count' => 1, 'permalink' => 'https://instagram.com/reel/n2'],
        ]]);
    }
    if ($g === "/$IG/media" && $m === 'GET') {
        $cur = date('Y-m'); $prev = date('Y-m', strtotime('first day of last month'));
        j(['data' => [
            ['id' => 'm1', 'caption' => 'Aprovados no vestibular! 🎉', 'media_type' => 'IMAGE', 'media_product_type' => 'FEED', 'timestamp' => "$cur-01T10:00:00+0000", 'like_count' => 300, 'comments_count' => 20, 'permalink' => 'https://instagram.com/p/m1', 'media_url' => 'https://scontent.cdninstagram.com/m1.jpg'],
            ['id' => 'm2', 'caption' => 'Bastidores da feira', 'media_type' => 'VIDEO', 'media_product_type' => 'REELS', 'timestamp' => "$cur-01T12:00:00+0000", 'like_count' => 900, 'comments_count' => 55, 'permalink' => 'https://instagram.com/reel/m2'],
            ['id' => 'm3', 'caption' => 'Matrículas abertas', 'media_type' => 'IMAGE', 'media_product_type' => 'FEED', 'timestamp' => "$cur-01T15:00:00+0000", 'like_count' => 100, 'comments_count' => 5, 'permalink' => 'https://instagram.com/p/m3'],
            ['id' => 'm0', 'caption' => 'Mês passado', 'media_type' => 'IMAGE', 'media_product_type' => 'FEED', 'timestamp' => "$prev-10T10:00:00+0000", 'like_count' => 50, 'comments_count' => 2, 'permalink' => 'https://instagram.com/p/m0'],
        ]]);
    }
    if ($g === "/$IG/media" && $m === 'POST') {
        if (($in['media_type'] ?? '') === 'CAROUSEL') {
            $kids = array_filter(explode(',', $in['children'] ?? ''));
            if (count($kids) < 2 || count($kids) > 20) j(['error' => ['message' => 'carousel needs 2-20 children']], 400);
            $id = nid('CONT_'); $S['containers'][$id] = ['params' => $in, 'bytes' => 0, 'type' => 'carousel', 'status' => 'FINISHED']; j(['id' => $id]);
        }
        $url = $in['image_url'] ?? $in['video_url'] ?? '';
        if ($url === '') j(['error' => ['message' => 'media url required']], 400);
        $ch = curl_init($url); curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]); $body = curl_exec($ch); $st = curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $ct = curl_getinfo($ch, CURLINFO_CONTENT_TYPE); curl_close($ch);
        if ($st !== 200) j(['error' => ['message' => "Meta não conseguiu baixar a mídia (HTTP $st)"]], 400);
        $id = nid('CONT_'); $S['containers'][$id] = ['params' => $in, 'conta' => $is2 ? 'ig2' : 'ig1', 'bytes' => strlen((string)$body), 'type' => $ct, 'status' => 'FINISHED'];
        j(['id' => $id]);
    }
    if ($g === "/$IG/media_publish") {
        $c = $in['creation_id'] ?? ''; if (!isset($S['containers'][$c])) j(['error' => ['message' => 'bad creation_id']], 400);
        $id = nid('MEDIA_'); $S['published'][$id] = $c; j(['id' => $id]);
    }
    if (preg_match('#^/(MEDIA_\d+)/comments$#', $g, $mm)) { $S['comments'][$mm[1]][] = $in['message'] ?? ''; j(['id' => nid('CMT_')]); }
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
    if ($g === '/calendar/v3/users/me/calendarList' && $m === 'GET') j(['items' => [['id' => 'cal1', 'summary' => 'Marketing', 'accessRole' => 'owner']]]);
    if ($g === '/calendar/v3/calendars/cal1' && $m === 'GET') j(['id' => 'cal1', 'summary' => 'Marketing']);
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

<?php
declare(strict_types=1);
/**
 * Tarefas automáticas das integrações (só linha de comando). Configure no hPanel → Cron Jobs:
 *   a cada 10 min:  php /home/USUARIO/public_html/cron_integracoes.php publicar
 *   1x por dia:     php /home/USUARIO/public_html/cron_integracoes.php sincronizar
 *  (sem argumento = as duas)
 * publicar     → publica no Instagram o que está APROVADO/PROGRAMADO, marcado "Publicar no Instagram" e com data vencida
 * sincronizar  → renova token da Meta, atualiza métricas do Instagram, sincroniza Google Agenda, atualiza Planilhas, envia entregas ao Drive
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/api/lib.php';
require __DIR__ . '/api/integrations.php';
require __DIR__ . '/api/google.php';
date_default_timezone_set(cfg()['timezone'] ?? 'America/Recife');
$what = $argv[1] ?? 'tudo';
$step = function (string $name, callable $fn): void {
    try {
        echo $name . ': ' . json_encode($fn(), JSON_UNESCAPED_UNICODE) . "\n";
    } catch (Throwable $e) {
        echo $name . ' ERRO: ' . $e->getMessage() . "\n";
        intLog('cron', 'erro', "$name: " . $e->getMessage());
    }
};
if (in_array($what, ['publicar', 'tudo'], true)) {
    $step('instagram-publicar', fn() => ['publicados' => igPublishDue()]);
}
if (in_array($what, ['sincronizar', 'tudo'], true)) {
    if (metaConnected()) {
        $step('instagram-token', function () { metaRefreshIfNeeded(); return 'ok'; });
        $step('instagram-metricas', fn() => ['periodos' => igSync()]);
    }
    if (gConnected()) {
        $step('google-agenda', fn() => gCalendarSync());
        $step('google-planilhas', fn() => gSheetsExport());
        if (setting('g_auto_drive_entregas') === '1') {
            $step('google-drive', function () {
                $n = 0;
                foreach (listRows('solicitacoes') as $r) {
                    if (!empty($r['arquivosEntrega'])) {
                        $n += gDriveSendEntregas($r['id']);
                    }
                }
                return ['arquivos' => $n];
            });
        }
    }
}

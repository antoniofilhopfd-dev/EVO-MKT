<?php
// Copie para config.php e preencha. NUNCA publique config.php em repositório.
return [
  'db' => [
    'driver' => 'mysql',               // 'mysql' (Hostinger) ou 'sqlite' (testes)
    'host' => 'localhost',
    'name' => 'u000000000_evomkt',
    'user' => 'u000000000_evomkt',
    'pass' => 'TROQUE_ESTA_SENHA',
    // sqlite: 'path' => __DIR__.'/storage/evo.sqlite',
  ],
  'install_key' => 'TROQUE_POR_UMA_CHAVE_LONGA', // exigida por install.php (use uma vez e apague o arquivo)
  'notify_to' => '',                 // e-mail da Gerente para avisos de nova demanda/aprovação (opcional)
  'mail_from' => '',                 // remetente, ex.: nao-responda@seudominio.com.br (opcional)
  'timezone' => 'America/Recife',
  'session_hours' => 12,
  'max_upload_mb' => 20,
  'backup_keep' => 30,
];

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
  'app_key' => 'TROQUE_POR_UM_TEXTO_ALEATORIO_DE_40_CARACTERES', // criptografa os tokens do Instagram/Google. NÃO troque depois de conectar.
  'public_url' => 'https://SEU-DOMINIO.com.br',  // endereço público do sistema (usado nos retornos OAuth e nos links de mídia)
  'timezone' => 'America/Recife',
  'session_hours' => 12,
  'max_upload_mb' => 20,
  'backup_keep' => 30,
];

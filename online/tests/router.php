<?php
// Roteador SOMENTE para testes com `php -S` (imita o .htaccess: /api/* → api/index.php).
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
$p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if(str_starts_with($p,'/api/')){require dirname(__DIR__).'/api/index.php';return true;}
$f=dirname(__DIR__).($p==='/'?'/index.html':$p);
if(!is_file($f)||str_contains($p,'..'))return false;
$m=['html'=>'text/html; charset=utf-8','js'=>'text/javascript','css'=>'text/css'][pathinfo($f,PATHINFO_EXTENSION)]??'application/octet-stream';
header('Content-Type: '.$m);readfile($f);return true;

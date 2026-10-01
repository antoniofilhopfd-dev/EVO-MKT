<?php
declare(strict_types=1);
/**
 * Recuperação de acesso quando a própria Gerente esquece a senha.
 *  Web: https://SEU-DOMINIO/reset_senha.php?key=SUA_INSTALL_KEY&codigo=NAT-3301
 *  CLI: php reset_senha.php SUA_INSTALL_KEY NAT-3301
 * Gera uma senha temporária (exibida uma vez). APAGUE este arquivo do servidor depois de usar.
 */
require __DIR__.'/api/lib.php';require __DIR__.'/api/integrations.php';require __DIR__.'/api/access.php';
$cli=PHP_SAPI==='cli';$key=$cli?($argv[1]??''):($_GET['key']??'');$cod=strtoupper(trim($cli?($argv[2]??''):($_GET['codigo']??'')));
if(!$cli)header('Content-Type: text/plain; charset=utf-8');
try{
    $c=cfg();
    if(!hash_equals((string)$c['install_key'],(string)$key)||str_starts_with((string)$c['install_key'],'TROQUE')){sleep(2);http_response_code(403);exit("Chave inválida.\n");}
    date_default_timezone_set($c['timezone']??'America/Recife');
    foreach(['users','portal_users'] as $tab){
        if(q("SELECT 1 FROM $tab WHERE codigo=?",[$cod])->fetch()){
            $p=genPassword();q("UPDATE $tab SET pass_hash=?,must_change=1,ativo=1 WHERE codigo=?",[password_hash($p,PASSWORD_DEFAULT),$cod]);
            q('DELETE FROM sessions WHERE codigo=?',[$cod]);audit('reset_senha.php','reset-senha:'.$cod);
            ensureAccessSchema();$extra='';
            if(($_GET['modo']??($argv[3]??''))==='senha'){setSetting('login_modo','senha');$extra="Acesso voltou ao modo código + senha: entre com $cod e a senha acima.\n";}
            elseif(loginMode()==='codigo'){$extra="O sistema está no modo SÓ CÓDIGO. Seu novo código de acesso: ".issueAccessCode($tab,$cod)."\n(Para voltar ao modo com senha, acrescente &modo=senha ao endereço.)\n";}
            exit("Senha temporária de $cod: $p\n$extra"."A pessoa deve trocá-la no primeiro acesso. APAGUE este arquivo do servidor.\n");
        }
    }
    http_response_code(404);echo "Código não encontrado.\n";
}catch(Throwable $e){http_response_code(500);echo 'Erro: '.$e->getMessage()."\n";}

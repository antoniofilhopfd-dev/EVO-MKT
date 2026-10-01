<?php
declare(strict_types=1);
/**
 * Instalador único do EVO MKT Online.
 *  - Web:  https://SEU-DOMINIO/install.php?key=SUA_INSTALL_KEY   (mostra as senhas UMA vez)
 *  - CLI:  php install.php SUA_INSTALL_KEY
 * Cria as tabelas, usuários e (opcional) importa os XLSX de storage/import/DADOS/.
 * Depois de instalar, renomeie/apague este arquivo. Ele se recusa a rodar duas vezes (storage/installed.lock).
 */
require __DIR__.'/api/lib.php';
require __DIR__.'/api/xlsx.php';
$cli=PHP_SAPI==='cli';
$key=$cli?($argv[1]??''):($_GET['key']??'');
if(!$cli){header('Content-Type: text/plain; charset=utf-8');}
try{
    $c=cfg();
    if(!hash_equals((string)$c['install_key'],(string)$key)||str_starts_with((string)$c['install_key'],'TROQUE')){http_response_code(403);exit("Chave de instalação inválida.\n");}
    date_default_timezone_set($c['timezone']??'America/Recife');
    $lock=__DIR__.'/storage/installed.lock';
    if(is_file($lock)){http_response_code(409);exit("Já instalado. Apague install.php.\n");}
    createSchema();
    $pw=[];
    $internos=[['NAT-3301','Natália Mello','manager','Gerente de Marketing'],['ANT-3302','Antônio Filho','team','Equipe de Marketing'],['MON-3303','Monique Vilante','team','Equipe de Marketing'],['ALU-3304','Aluizo Junior','team','Equipe de Marketing'],['EDU-3305','Maria Eduarda','team','Equipe de Marketing']];
    foreach($internos as [$cod,$nome,$role,$label]){
        if(q('SELECT 1 FROM users WHERE codigo=?',[$cod])->fetch())continue;
        $p=genPassword();q('INSERT INTO users(codigo,nome,role,label,pass_hash,must_change,ativo) VALUES(?,?,?,?,?,1,1)',[$cod,$nome,$role,$label,password_hash($p,PASSWORD_DEFAULT)]);$pw["interno $cod ($nome)"]=$p;
    }
    $portal=[['INF-2601','Coordenação Infantil','COORDENACAO',['Infantil']],['INI-2602','Coordenação Anos Iniciais','COORDENACAO',['Anos Iniciais']],['FIN-2603','Coordenação Anos Finais','COORDENACAO',['Anos Finais']],['MED-2604','Coordenação Ensino Médio','COORDENACAO',['Ensino Médio']],['AUZ-2605','Auzilair','COORDENACAO_ATENDIMENTO_GRAFICA',['Infantil','Gráfica Infantil']]];
    foreach($portal as [$cod,$nome,$perfil,$segs]){
        if(q('SELECT 1 FROM portal_users WHERE codigo=?',[$cod])->fetch())continue;
        $p=genPassword();q('INSERT INTO portal_users(codigo,nome,perfil,segmentos,pass_hash,must_change,ativo) VALUES(?,?,?,?,?,1,1)',[$cod,$nome,$perfil,json_encode($segs,JSON_UNESCAPED_UNICODE),password_hash($p,PASSWORD_DEFAULT)]);$pw["portal $cod ($nome)"]=$p;
    }
    // Importação opcional dos XLSX (preserva IDs; nunca reutiliza).
    $imp=__DIR__.'/storage/import/DADOS';$importados=[];
    if(is_dir($imp)){
        foreach(MODULES as $mod=>$pre){
            $f="$imp/EVO_MKT_".strtoupper($mod).'.xlsx';if(!is_file($f))continue;
            [$hdr,$rows]=readXlsx($f);if($hdr)mergeHeaders($mod,$hdr);$max=0;$n=0;
            foreach($rows as $r){
                $id=trim($r['id']??'');if($id==='')continue;
                if(q('SELECT 1 FROM used_ids WHERE id=?',[$id])->fetch())continue;
                $t=$r['criadoEm']?:now();q('INSERT INTO used_ids(id) VALUES(?)',[$id]);
                q('INSERT INTO records(modulo,id,data,criado_em,atualizado_em) VALUES(?,?,?,?,?)',[$mod,$id,json_encode($r,JSON_UNESCAPED_UNICODE),$t,$r['atualizadoEm']?:$t]);
                if(preg_match('/(\d+)$/',$id,$m))$max=max($max,(int)$m[1]);$n++;
            }
            if($n){q('DELETE FROM id_counters WHERE modulo=?',[$mod]);q('INSERT INTO id_counters(modulo,n) VALUES(?,?)',[$mod,$max]);}
            $importados[$mod]=$n;
        }
    }
    $fichas=seedEquipe('instalador');
    file_put_contents($lock,now());
    echo "INSTALAÇÃO CONCLUÍDA\n\nSenhas temporárias (anote AGORA; não serão exibidas de novo; troque no primeiro acesso):\n";
    foreach($pw as $k=>$v)echo " - $k: $v\n";
    echo "\nFichas de Equipe criadas: $fichas (ajuste e-mail e capacidade em Equipe).\n";
    echo "\nRegistros importados por módulo: ".json_encode($importados,JSON_UNESCAPED_UNICODE)."\n\nApague do servidor: install.php, diagnostico.php e a pasta storage/import/.\n";
}catch(Throwable $e){http_response_code(500);echo 'Erro: '.$e->getMessage()."\n";}

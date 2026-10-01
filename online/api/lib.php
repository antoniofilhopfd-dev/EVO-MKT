<?php
declare(strict_types=1);
const EVO_VERSION='4.1.0-online';
const MODULES=['agenda'=>'AGE','aprovacoes'=>'APR','arquivos'=>'ARQ','calendario'=>'CAL','campanhas'=>'CAM','configuracoes'=>'CFG','conteudos'=>'CON','equipe'=>'EQP','eventos'=>'EVT','ideias'=>'IDE','instagram'=>'INS','integracoes'=>'INT','lixeira'=>'LIX','projetos'=>'PRJ','relatorios'=>'REL','solicitacoes'=>'SOL','tarefas'=>'TAR','templates'=>'TPL','trafego'=>'TRF'];
const BASE_HEADERS=['id','titulo','status','prioridade','responsavel','segmento','dataInicio','prazo','descricao','tags','origem','idExterno','ultimaSincronizacao','criadoEm','atualizadoEm'];
// Equipe (perfil "team") pode gravar nestes módulos; Gerente grava em todos.
const TEAM_WRITE=['agenda','calendario','tarefas','projetos','eventos','conteudos','ideias','campanhas','aprovacoes','instagram','trafego','templates','arquivos','solicitacoes','relatorios'];
const PUBLIC_FIELDS=['id','titulo','status','prioridade','responsavel','segmento','solicitante','prazo','descricao','criadoEm','atualizadoEm','tipoSolicitacao','objetivo','publicoAlvo','mensagemPrincipal','canal','slaDias','prazoSLA','prazoNegociado','referencias','anexos','triagemStatus','retornoSolicitante','respostaSolicitante','aprovacaoSolicitante','motivoUrgencia','distribuidoEm','ajusteSolicitadoEm','respondidoSolicitanteEm','entregaEm','entregaEnviadaEm','aprovadoSolicitanteEm','arquivosEntrega','entregaMensagem','recorrente','recorrenciaFrequencia','recorrenciaFim','solicitanteNome','avaliacaoNota','avaliacaoComentario','avaliadoEm'];
const CREATE_FIELDS=['titulo','tipoSolicitacao','segmento','objetivo','publicoAlvo','mensagemPrincipal','canal','prazo','prioridade','motivoUrgencia','referencias','slaDias','prazoSLA','aprovacaoSolicitante','recorrente','recorrenciaFrequencia','recorrenciaFim','solicitanteNome'];
const UPDATE_FIELDS=['respostaSolicitante','respondidoSolicitanteEm','aprovacaoSolicitante','aprovadoSolicitanteEm','avaliacaoNota','avaliacaoComentario','avaliadoEm'];
const ALLOWED_EXT=['pdf','png','jpg','jpeg','gif','webp','mp4','mov','doc','docx','xls','xlsx','ppt','pptx','txt','csv','zip','psd','ai','svg','mp3','wav'];
class HttpError extends Exception{public function __construct(public int $status,string $msg){parent::__construct($msg);}}
function fail(int $s,string $m):never{throw new HttpError($s,$m);}
function cfg():array{static $c=null;if($c===null){$f=__DIR__.'/../config.php';if(!is_file($f))fail(500,'Sistema não configurado (config.php ausente).');$c=require $f;}return $c;}
function now():string{return date('c');}
function db():PDO{static $pdo=null;if($pdo)return $pdo;$d=cfg()['db'];
 if(($d['driver']??'mysql')==='sqlite'){$pdo=new PDO('sqlite:'.$d['path']);$pdo->exec('PRAGMA foreign_keys=ON');}
 else{$pdo=new PDO("mysql:host=".$d['host'].";dbname=".$d['name'].";charset=utf8mb4",$d['user'],$d['pass']);}
 $pdo->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);return $pdo;}
function isSqlite():bool{return (cfg()['db']['driver']??'mysql')==='sqlite';}
function q(string $sql,array $p=[]):PDOStatement{$s=db()->prepare($sql);$s->execute($p);return $s;}

function createSchema():void{
 $t=isSqlite()?'TEXT':'LONGTEXT';$k=isSqlite()?'TEXT':'VARCHAR(64)';$ine=isSqlite()?'':' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
 $stmts=[
 "CREATE TABLE IF NOT EXISTS records(modulo $k NOT NULL,id $k NOT NULL,data $t NOT NULL,criado_em VARCHAR(40) NOT NULL,atualizado_em VARCHAR(40) NOT NULL,PRIMARY KEY(modulo,id))$ine",
 "CREATE TABLE IF NOT EXISTS module_headers(modulo $k PRIMARY KEY,headers $t NOT NULL)$ine",
 "CREATE TABLE IF NOT EXISTS id_counters(modulo $k PRIMARY KEY,n INTEGER NOT NULL)$ine",
 "CREATE TABLE IF NOT EXISTS used_ids(id $k PRIMARY KEY)$ine",
 "CREATE TABLE IF NOT EXISTS users(codigo $k PRIMARY KEY,nome VARCHAR(120) NOT NULL,role VARCHAR(20) NOT NULL,label VARCHAR(120) NOT NULL,pass_hash VARCHAR(255) NOT NULL,must_change INTEGER NOT NULL DEFAULT 1,ativo INTEGER NOT NULL DEFAULT 1)$ine",
 "CREATE TABLE IF NOT EXISTS portal_users(codigo $k PRIMARY KEY,nome VARCHAR(120) NOT NULL,perfil VARCHAR(60) NOT NULL,segmentos $t NOT NULL,pass_hash VARCHAR(255) NOT NULL,must_change INTEGER NOT NULL DEFAULT 1,ativo INTEGER NOT NULL DEFAULT 1)$ine",
 "CREATE TABLE IF NOT EXISTS sessions(token_hash VARCHAR(64) PRIMARY KEY,tipo VARCHAR(10) NOT NULL,codigo $k NOT NULL,expira INTEGER NOT NULL)$ine",
 "CREATE TABLE IF NOT EXISTS login_attempts(chave VARCHAR(190) NOT NULL,quando INTEGER NOT NULL)$ine",
 "CREATE TABLE IF NOT EXISTS notices(id $k PRIMARY KEY,data $t NOT NULL)$ine",
 "CREATE TABLE IF NOT EXISTS audit_log(id ".(isSqlite()?'INTEGER PRIMARY KEY AUTOINCREMENT':'BIGINT AUTO_INCREMENT PRIMARY KEY').",quando VARCHAR(40) NOT NULL,ator VARCHAR(120) NOT NULL,acao VARCHAR(60) NOT NULL,modulo VARCHAR(40) NOT NULL,registro VARCHAR(64) NOT NULL,ip VARCHAR(64) NOT NULL)$ine",
 ];
 foreach($stmts as $s)db()->exec($s);
}
function audit(string $ator,string $acao,string $mod='',string $id=''):void{try{q('INSERT INTO audit_log(quando,ator,acao,modulo,registro,ip) VALUES(?,?,?,?,?,?)',[now(),$ator,$acao,$mod,$id,$_SERVER['REMOTE_ADDR']??'-']);}catch(Throwable){}}

// ---------- IDs: únicos, sequenciais por módulo, nunca reutilizados ----------
function newId(string $mod):string{
 $pdo=db();$pre=MODULES[$mod];
 for($i=0;$i<50;$i++){
  $pdo->beginTransaction();
  try{
   $r=q('SELECT n FROM id_counters WHERE modulo=?'.(isSqlite()?'':' FOR UPDATE'),[$mod])->fetch();
   $n=($r?(int)$r['n']:0)+1;
   if($r)q('UPDATE id_counters SET n=? WHERE modulo=?',[$n,$mod]);else q('INSERT INTO id_counters(modulo,n) VALUES(?,?)',[$mod,$n]);
   $id=sprintf('%s-%04d',$pre,$n);
   $ok=q('SELECT 1 FROM used_ids WHERE id=?',[$id])->fetch();
   if(!$ok){q('INSERT INTO used_ids(id) VALUES(?)',[$id]);$pdo->commit();return $id;}
   $pdo->commit();
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
 }
 fail(500,'Não foi possível gerar um ID único.');
}

// ---------- registros ----------
function strv(mixed $v):string{if($v===null)return '';if(is_bool($v))return $v?'true':'false';if(is_scalar($v))return (string)$v;return json_encode($v,JSON_UNESCAPED_UNICODE);}
function headersOf(string $mod):array{$r=q('SELECT headers FROM module_headers WHERE modulo=?',[$mod])->fetch();$h=$r?json_decode($r['headers'],true):[];return $h?:BASE_HEADERS;}
function mergeHeaders(string $mod,array $keys):void{$h=headersOf($mod);$new=array_values(array_diff($keys,$h));if(!$new)return;$h=array_merge($h,$new);
 $e=q('SELECT 1 FROM module_headers WHERE modulo=?',[$mod])->fetch();$j=json_encode($h,JSON_UNESCAPED_UNICODE);
 if($e)q('UPDATE module_headers SET headers=? WHERE modulo=?',[$j,$mod]);else q('INSERT INTO module_headers(modulo,headers) VALUES(?,?)',[$mod,$j]);}
function listRows(string $mod):array{$o=[];foreach(q('SELECT data FROM records WHERE modulo=? ORDER BY criado_em,id',[$mod]) as $r)$o[]=json_decode($r['data'],true);return $o;}
function getRow(string $mod,string $id):?array{$r=q('SELECT data FROM records WHERE modulo=? AND id=?',[$mod,$id])->fetch();return $r?json_decode($r['data'],true):null;}
function cleanInput(array $in):array{$o=[];foreach($in as $k=>$v){if(!is_string($k)||!preg_match('/^[A-Za-z][A-Za-z0-9_]{0,63}$/',$k))continue;$s=strv($v);if(strlen($s)>20000)fail(400,"Campo '$k' muito longo.");$o[$k]=$s;}return $o;}
function insertRow(string $mod,array $row,string $ator):array{
 $row=cleanInput($row);unset($row['id']);$id=newId($mod);$t=now();
 $row=['id'=>$id]+$row;$row['criadoEm']=$t;$row['atualizadoEm']=$t;$row['criadoPor']=$ator;
 q('INSERT INTO records(modulo,id,data,criado_em,atualizado_em) VALUES(?,?,?,?,?)',[$mod,$id,json_encode($row,JSON_UNESCAPED_UNICODE),$t,$t]);
 mergeHeaders($mod,array_keys($row));audit($ator,'criar',$mod,$id);return $row;}
function saveRow(string $mod,array $row):void{$t=$row['atualizadoEm'];q('UPDATE records SET data=?,atualizado_em=? WHERE modulo=? AND id=?',[json_encode($row,JSON_UNESCAPED_UNICODE),$t,$mod,$row['id']]);mergeHeaders($mod,array_keys($row));}
function updateRow(string $mod,string $id,array $patch,string $ator):array{
 $cur=getRow($mod,$id)??fail(404,'Registro não encontrado.');$patch=cleanInput($patch);
 unset($patch['id'],$patch['criadoEm'],$patch['criadoPor'],$patch['atualizadoPor']);$new=array_merge($cur,$patch);$new['atualizadoEm']=now();$new['atualizadoPor']=$ator;saveRow($mod,$new);audit($ator,'editar',$mod,$id);return $new;}
function trashRow(string $mod,string $id,string $ator):void{
 $cur=getRow($mod,$id)??fail(404,'Registro não encontrado.');
 if($mod==='lixeira'){q('DELETE FROM records WHERE modulo=? AND id=?',['lixeira',$id]);audit($ator,'excluir-permanente','lixeira',$id);return;}
 $copy=$cur;unset($copy['id']);$copy['origem']=$mod;$copy['idOriginal']=$id;insertRow('lixeira',$copy,$ator);
 q('DELETE FROM records WHERE modulo=? AND id=?',[$mod,$id]);audit($ator,'lixeira',$mod,$id);}

// ---------- backup ----------
function makeBackup(string $motivo='manual'):string{
 $dump=['versao'=>EVO_VERSION,'em'=>now(),'motivo'=>$motivo,'records'=>q('SELECT * FROM records')->fetchAll(),'headers'=>q('SELECT * FROM module_headers')->fetchAll(),'counters'=>q('SELECT * FROM id_counters')->fetchAll(),'used_ids'=>q('SELECT id FROM used_ids')->fetchAll(),'notices'=>q('SELECT * FROM notices')->fetchAll()];
 $dir=__DIR__.'/../storage/backups';if(!is_dir($dir))mkdir($dir,0750,true);
 $name='evo_backup_'.date('Ymd_His').'_'.preg_replace('/[^a-z0-9]/i','',$motivo).'.json.gz';$tmp="$dir/$name.tmp";
 file_put_contents($tmp,gzencode(json_encode($dump,JSON_UNESCAPED_UNICODE),6));rename($tmp,"$dir/$name");
 $files=glob("$dir/evo_backup_*.json.gz");sort($files);$keep=(int)(cfg()['backup_keep']??30);
 while(count($files)>$keep)@unlink(array_shift($files));return $name;}
function autoBackupIfDue():void{$dir=__DIR__.'/../storage/backups';$f=glob("$dir/evo_backup_*.json.gz")?:[];$last=$f?max(array_map('filemtime',$f)):0;if(time()-$last>86400)makeBackup('auto');}

// ---------- sessão / auth ----------
function ip():string{return $_SERVER['REMOTE_ADDR']??'-';}
function rateCheck(string $chave,int $max=5):void{$lim=time()-900;q('DELETE FROM login_attempts WHERE quando<?',[$lim]);$n=(int)q('SELECT COUNT(*) c FROM login_attempts WHERE chave=?',[$chave])->fetch()['c'];if($n>=$max)fail(429,'Muitas tentativas. Aguarde 15 minutos.');}
function rateFail(string $chave):void{q('INSERT INTO login_attempts(chave,quando) VALUES(?,?)',[$chave,time()]);}
function startSession(string $tipo,string $codigo):string{$tok=bin2hex(random_bytes(32));$h=(int)(cfg()['session_hours']??12);q('INSERT INTO sessions(token_hash,tipo,codigo,expira) VALUES(?,?,?,?)',[hash('sha256',$tok),$tipo,$codigo,time()+$h*3600]);q('DELETE FROM sessions WHERE expira<?',[time()]);return $tok;}
function sessionFor(string $tok,string $tipo):?array{if($tok==='')return null;$r=q('SELECT * FROM sessions WHERE token_hash=? AND tipo=? AND expira>?',[hash('sha256',$tok),$tipo,time()])->fetch();if(!$r)return null;
 if($tipo==='int'){$u=q('SELECT codigo,nome,role,label,must_change FROM users WHERE codigo=? AND ativo=1',[$r['codigo']])->fetch();return $u?:null;}
 $u=q('SELECT codigo,nome,perfil,segmentos,must_change FROM portal_users WHERE codigo=? AND ativo=1',[$r['codigo']])->fetch();if(!$u)return null;$u['segmentos']=json_decode($u['segmentos'],true);return $u;}
function internalUser():?array{return sessionFor($_COOKIE['evo_sid']??'','int');}
function portalUser():?array{return sessionFor($_SERVER['HTTP_X_PORTAL_TOKEN']??'','por');}
function requireInternal():array{return internalUser()??fail(401,'Sessão expirada. Entre novamente.');}
function requireManager():array{$u=requireInternal();if($u['role']!=='manager')fail(403,'Ação disponível apenas para a Gerente.');return $u;}
function requirePortal():array{return portalUser()??fail(401,'Sessão expirada');}
function checkCsrf():void{if(($_SERVER['HTTP_X_EVO']??'')!=='1')fail(403,'Requisição inválida.');}
function strongPassword(string $p):void{if(strlen($p)<10||!preg_match('/[A-Za-z]/',$p)||!preg_match('/\d/',$p))fail(400,'A senha deve ter ao menos 10 caracteres, com letras e números.');}
function genPassword():string{$a='abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';$s='';for($i=0;$i<12;$i++)$s.=$a[random_int(0,strlen($a)-1)];return $s;}
function allowedSegment(array $u,string $seg):bool{foreach($u['segmentos'] as $s)if(mb_strtolower(trim($s))===mb_strtolower(trim($seg)))return true;return false;}
function publicRow(array $r):array{$o=[];foreach(PUBLIC_FIELDS as $k)if(array_key_exists($k,$r))$o[$k]=$r[$k];return $o;}

// ---------- permissão por registro (Equipe só exclui o que criou ou é responsável) ----------
function teamMayDelete(array $u,array $row):bool{
    if($u['role']==='manager')return true;
    $resp=trim($row['responsavel']??'');
    return ($row['criadoPor']??'')===$u['codigo']||$resp===''||mb_strtolower($resp)===mb_strtolower($u['nome']);
}
// ---------- e-mail (opcional, melhor esforço; configure 'notify_to' e 'mail_from' em config.php) ----------
function notifyMail(string $assunto,string $texto,?string $to=null):void{
    $c=cfg();$to=$to??($c['notify_to']??'');if($to==='')return;
    if(!empty($c['mail_log'])){@file_put_contents($c['mail_log'],json_encode(['to'=>$to,'assunto'=>$assunto,'texto'=>$texto],JSON_UNESCAPED_UNICODE)."\n",FILE_APPEND);return;}
    $from=$c['mail_from']??('nao-responda@'.($_SERVER['HTTP_HOST']??'localhost'));
    $h="From: EVO MKT <$from>\r\nContent-Type: text/plain; charset=UTF-8\r\n";
    try{if(!@mail($to,'=?UTF-8?B?'.base64_encode('[EVO MKT] '.$assunto).'?=',$texto,$h))throw new RuntimeException('mail() falhou');}
    catch(Throwable $e){@file_put_contents(__DIR__.'/../storage/erro.log',date('c').' mail: '.$e->getMessage()."\n",FILE_APPEND);}
}

function emailForPerson(string $name):string{
    $n=mb_strtolower(trim($name));if($n==='')return '';
    foreach(listRows('equipe') as $r){if(mb_strtolower(trim($r['titulo']??''))===$n&&filter_var($r['email']??'',FILTER_VALIDATE_EMAIL))return $r['email'];}
    return '';
}
/** Avisa a pessoa quando um item passa a ser dela (melhor esforço; precisa de e-mail na ficha da Equipe). */
function notifyAssignment(string $mod,array $new,?array $old,string $actorName):void{
    if(!in_array($mod,['tarefas','projetos','conteudos','eventos','solicitacoes','agenda'],true))return;
    $resp=trim($new['responsavel']??'');if($resp===''||mb_strtolower($resp)===mb_strtolower($actorName))return;
    if($old&&mb_strtolower(trim($old['responsavel']??''))===mb_strtolower($resp))return;
    $to=emailForPerson($resp);if($to==='')return;
    notifyMail('Nova atribuição: '.($new['titulo']??$new['id']),"Olá, $resp!\n\n$actorName atribuiu a você: ".($new['titulo']??'')."\nMódulo: $mod · Prazo: ".($new['prazo']??'—')."\n\nAcesse o EVO MKT para ver os detalhes.",$to);
}
/** Cria a ficha de Equipe (capacidade, e-mail, função) de cada acesso interno que ainda não tem. */
function seedEquipe(string $ator):int{
    $n=0;$have=array_map(fn($r)=>mb_strtolower(trim($r['titulo']??'')),listRows('equipe'));
    foreach(q('SELECT codigo,nome,role,label FROM users WHERE ativo=1 ORDER BY codigo') as $u){
        if(in_array(mb_strtolower($u['nome']),$have,true))continue;
        insertRow('equipe',['titulo'=>$u['nome'],'status'=>'ATIVO','funcao'=>$u['label'],'nivelAcesso'=>$u['role']==='manager'?'Administrador':'Marketing','capacidadeSemanal'=>'40','ativo'=>'SIM','email'=>'','codigoInterno'=>$u['codigo']],$ator);$n++;
    }
    return $n;
}

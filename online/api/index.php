<?php
declare(strict_types=1);
require __DIR__.'/lib.php';
require __DIR__.'/integrations.php';
require __DIR__.'/google.php';
require __DIR__.'/access.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out(mixed $d,int $s=200):never{http_response_code($s);echo json_encode($d,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);exit;}
function body():array{
    $raw=file_get_contents('php://input');
    if($raw===''||$raw===false)return [];
    if(strlen($raw)>2_000_000)fail(413,'Requisição muito grande.');
    $j=json_decode($raw,true);
    if(!is_array($j))fail(400,'JSON inválido.');
    return $j;
}
function qs(string $k):string{return trim((string)($_GET[$k]??''));}
function safePart(string $s):string{return preg_replace('/[^A-Za-z0-9._-]/','_',$s)??'';}

try{
    date_default_timezone_set(cfg()['timezone']??'America/Recife');
    $method=$_SERVER['REQUEST_METHOD'];
    $path='/'.trim(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH)??'','/');
    $path=preg_replace('#^.*?/api(?=/|$)#','',$path)?:'/';
    if($method!=='GET'&&$method!=='HEAD')checkCsrfOrPortal($path);

    switch(true){
    case $path==='/heartbeat': out(['ok'=>true]);
    case $path==='/health': {
        requireInternal();
        $mods=[];$total=0;
        foreach(MODULES as $m=>$_){
            $r=q('SELECT COUNT(*) c,COALESCE(SUM(LENGTH(data)),0) s,MAX(atualizado_em) m FROM records WHERE modulo=?',[$m])->fetch();
            $total+=(int)$r['c'];
            $mods[]=['module'=>$m,'file'=>"tabela:$m",'ok'=>true,'records'=>(int)$r['c'],'size'=>(int)$r['s'],'modified'=>$r['m']];
        }
        out(['ok'=>true,'version'=>EVO_VERSION,'records'=>$total,'dataDir'=>'Banco de dados','modules'=>$mods]);
    }

    // ---------- autenticação interna ----------
    case $path==='/auth/login' && $method==='POST': {
        $in=body();$cod=strtoupper(trim((string)($in['codigo']??'')));$sen=(string)($in['senha']??'');
        if(loginMode()==='codigo'){
            codeLoginGuard();
            $u=validCodeFormat($cod)?q('SELECT * FROM users WHERE acesso_hmac=? AND ativo=1',[accessHmac($cod)])->fetch():false;
            if(!$u)codeLoginFail('?');
            $tok=startSession('int',$u['codigo']);
            setcookie('evo_sid',$tok,['expires'=>time()+((int)(cfg()['session_hours']??12))*3600,'path'=>'/','httponly'=>true,'samesite'=>'Strict','secure'=>!empty($_SERVER['HTTPS'])||($_SERVER['HTTP_X_FORWARDED_PROTO']??'')==='https']);
            audit($u['codigo'],'login');registerDevice('int',$u['codigo'],$u['nome']);
            out(['user'=>['code'=>$u['codigo'],'name'=>$u['nome'],'role'=>$u['role'],'label'=>$u['label']],'mustChange'=>$u['role']==='manager'&&(bool)$u['must_change']]);
        }
        $key='int|'.ip().'|'.$cod;rateCheck($key);rateCheck('ip|'.ip(),40);
        $u=q('SELECT * FROM users WHERE codigo=? AND ativo=1',[$cod])->fetch();
        if(!$u||!password_verify($sen,$u['pass_hash'])){rateFail($key);rateFail('ip|'.ip());audit($cod?:'?','login-falhou');fail(401,'Código ou senha inválidos.');}
        $tok=startSession('int',$cod);
        setcookie('evo_sid',$tok,['expires'=>time()+((int)(cfg()['session_hours']??12))*3600,'path'=>'/','httponly'=>true,'samesite'=>'Strict','secure'=>!empty($_SERVER['HTTPS'])||($_SERVER['HTTP_X_FORWARDED_PROTO']??'')==='https']);
        audit($cod,'login');
        out(['user'=>['code'=>$u['codigo'],'name'=>$u['nome'],'role'=>$u['role'],'label'=>$u['label']],'mustChange'=>(bool)$u['must_change']]);
    }
    case $path==='/auth/me': {
        $u=requireInternal();
        out(['user'=>['code'=>$u['codigo'],'name'=>$u['nome'],'role'=>$u['role'],'label'=>$u['label']],'mustChange'=>(bool)$u['must_change']]);
    }
    case $path==='/auth/logout' && $method==='POST': {
        $t=$_COOKIE['evo_sid']??'';
        if($t!=='')q('DELETE FROM sessions WHERE token_hash=?',[hash('sha256',$t)]);
        setcookie('evo_sid','',['expires'=>1,'path'=>'/']);
        out(['ok'=>true]);
    }
    case $path==='/auth/password' && $method==='POST': {
        $u=requireInternal();$in=body();
        $row=q('SELECT pass_hash FROM users WHERE codigo=?',[$u['codigo']])->fetch();
        if(!password_verify((string)($in['atual']??''),$row['pass_hash']))fail(403,'Senha atual incorreta.');
        strongPassword((string)($in['nova']??''));
        q('UPDATE users SET pass_hash=?,must_change=0 WHERE codigo=?',[password_hash((string)$in['nova'],PASSWORD_DEFAULT),$u['codigo']]);
        audit($u['codigo'],'senha-alterada');out(['ok'=>true]);
    }
    case $path==='/admin/reset-password' && $method==='POST': {
        $m=requireManager();$in=body();stepUp($m,$in);$tipo=(string)($in['tipo']??'');$cod=strtoupper(trim((string)($in['codigo']??'')));
        $tab=$tipo==='portal'?'portal_users':($tipo==='interno'?'users':fail(400,'Tipo inválido.'));
        if(!q("SELECT 1 FROM $tab WHERE codigo=?",[$cod])->fetch())fail(404,'Usuário não encontrado.');
        if(loginMode()==='codigo'){$novo=issueAccessCode($tab,$cod);audit($m['codigo'],'reset-codigo:'.$cod);out(['codigo'=>$cod,'senhaTemporaria'=>$novo,'modo'=>'codigo']);}
        $p=genPassword();q("UPDATE $tab SET pass_hash=?,must_change=1 WHERE codigo=?",[password_hash($p,PASSWORD_DEFAULT),$cod]);
        q('DELETE FROM sessions WHERE codigo=?',[$cod]);audit($m['codigo'],'reset-senha:'.$cod);
        out(['codigo'=>$cod,'senhaTemporaria'=>$p]);
    }

    // ---------- dados internos ----------
    case $path==='/data': {
        $mod=qs('module');$id=qs('id');
        $portal=portalUser();
        if($portal&&!internalUser())portalRestrictedUpdate($portal,$method,$mod,$id);
        $u=requireInternal();
        if(!isset(MODULES[$mod]))fail(404,'Módulo desconhecido.');
        if($mod==='configuracoes'&&$method!=='GET'&&$u['role']!=='manager')fail(403,'Somente a Gerente altera configurações.');
        if($method==='GET'){
            if($id!==''){$r=getRow($mod,$id)??fail(404,'Registro não encontrado.');out($r);}
            out(['headers'=>headersOf($mod),'rows'=>listRows($mod)]);
        }
        if($u['role']!=='manager'&&!in_array($mod,TEAM_WRITE,true)&&!($mod==='lixeira'))fail(403,'Seu perfil não pode alterar este módulo.');
        if($u['role']!=='manager'&&$mod==='lixeira'&&$method==='DELETE')fail(403,'Exclusão permanente apenas para a Gerente.');
        autoBackupIfDue();
        if($method==='POST'){$novo=insertRow($mod,body(),$u['codigo']);notifyAssignment($mod,$novo,null,$u['nome']);out($novo,201);}
        if($id==='')fail(400,'Informe o id.');
        if($method==='PUT'){
            $patch=body();$antes=getRow($mod,$id)??fail(404,'Registro não encontrado.');
            if($u['role']!=='manager'&&array_key_exists('responsavel',$patch)){
                $dono=trim($antes['responsavel']??'');$novoResp=trim(strv($patch['responsavel']));
                if($dono!==''&&mb_strtolower($dono)!==mb_strtolower($u['nome'])&&$novoResp!==$dono)fail(403,'Só a Gerente ou o responsável atual pode reatribuir este item.');
            }
            $dep=updateRow($mod,$id,$patch,$u['codigo']);notifyAssignment($mod,$dep,$antes,$u['nome']);out($dep);
        }
        if($method==='DELETE'){
            $alvo=getRow($mod,$id)??fail(404,'Registro não encontrado.');
            if(!teamMayDelete($u,$alvo))fail(403,'Você só pode excluir itens criados por você ou atribuídos a você.');
            if($mod==='lixeira')makeBackup('preexclusao');
            trashRow($mod,$id,$u['codigo']);out(['ok'=>true]);
        }
        fail(405,'Método não permitido.');
    }
    case $path==='/search': {
        $u=requireInternal();$term=mb_strtolower(qs('q'));$res=[];
        if($term==='')out([]);
        foreach(MODULES as $m=>$_){
            if($m==='configuracoes'&&$u['role']!=='manager')continue;
            foreach(listRows($m) as $r){
                if(str_contains(mb_strtolower(implode(' ',$r)),$term)){$r['module']=$m;$res[]=$r;if(count($res)>=300)break 2;}
            }
        }
        out($res);
    }
    case $path==='/backup' && $method==='POST': {$u=requireManager();$f=makeBackup('manual');audit($u['codigo'],'backup','',$f);out(['ok'=>true,'file'=>$f]);}
    case $path==='/backup/list': {requireManager();$f=glob(__DIR__.'/../storage/backups/evo_backup_*.json.gz')?:[];rsort($f);out(array_map('basename',$f));}
    case $path==='/backup/download': {
        requireManager();$f=basename(qs('file'));
        if(!preg_match('/^evo_backup_[0-9]{8}_[0-9]{6}_[A-Za-z0-9]+\.json\.gz$/',$f))fail(400,'Arquivo inválido.');
        $p=__DIR__.'/../storage/backups/'.$f;is_file($p)||fail(404,'Não encontrado.');
        header('Content-Type: application/gzip');header('Content-Disposition: attachment; filename="'.$f.'"');readfile($p);exit;
    }
    case $path==='/portal/users': {
        requireManager();$o=[];
        foreach(q('SELECT codigo,nome,perfil,segmentos,ativo FROM portal_users ORDER BY nome') as $r){$r['segmentos']=json_decode($r['segmentos'],true);$r['id']=$r['codigo'];$r['ativo']=(bool)$r['ativo'];$o[]=$r;}
        out($o);
    }
    case $path==='/manager/upload' && $method==='POST': {
        $u=requireInternal();$id=qs('id');$row=getRow('solicitacoes',$id)??fail(404,'Solicitação não encontrada.');
        $saved=saveUploads($id,'ENTREGA');
        $cur=array_filter(array_map('trim',explode('|',$row['arquivosEntrega']??'')));
        $row['arquivosEntrega']=implode(' | ',array_merge($cur,$saved));$row['atualizadoEm']=now();saveRow('solicitacoes',$row);
        audit($u['codigo'],'upload-entrega','solicitacoes',$id);
        if(setting('g_auto_drive_entregas')==='1'&&gConnected()){try{gDriveSendEntregas($id);}catch(Throwable $e){intLog('google','erro','Drive automático: '.$e->getMessage());}}
        out(['files'=>$saved]);
    }
    case $path==='/file': {
        $u=requireInternal();serveFile(qs('path'),null);
    }

    // ---------- Integrações (Instagram / Google) ----------
    case $path==='/public/media': serveSignedMedia();
    case $path==='/integrations/meta/callback' || $path==='/integrations/google/callback': {
        $svc=str_contains($path,'meta')?'meta':'google';
        $dest='/?page=administracao&int=';
        try{
            if(!checkState((string)($_GET['state']??''),$svc))throw new RuntimeException('Sessão de conexão expirada. Tente de novo.');
            if(!empty($_GET['error']))throw new RuntimeException('Autorização negada: '.($_GET['error_description']??$_GET['error']));
            $svc==='meta'?metaFinishConnect((string)($_GET['code']??'')):gFinishConnect((string)($_GET['code']??''));
            audit('integracao:'.$svc,'conectado');
            header('Location: '.$dest.$svc.'_ok');
        }catch(Throwable $e){
            intLog($svc,'erro',$e->getMessage());
            header('Location: '.$dest.$svc.'_erro&msg='.rawurlencode(mb_substr($e->getMessage(),0,200)));
        }
        http_response_code(302);exit;
    }
    case $path==='/integrations/status': {
        requireManager();ensureIntegrationSchema();
        $exp=(int)setting('meta_token_expira','0');
        out(['instagram'=>['configurado'=>setting('meta_app_id')!==''&&setting('meta_app_secret')!=='','appId'=>setting('meta_app_id'),'conectado'=>metaConnected(),'usuario'=>setting('ig_username'),'pagina'=>setting('meta_page_name'),'expiraEm'=>$exp?date('c',$exp):'','ultimaSync'=>setting('ig_last_sync')],
            'google'=>['configurado'=>setting('g_client_id')!==''&&setting('g_client_secret')!=='','clientId'=>setting('g_client_id'),'conectado'=>gConnected(),'email'=>setting('g_email'),'ultimaAgenda'=>setting('g_last_cal_sync'),'planilhaUrl'=>setting('g_sheet_url'),'ultimaPlanilha'=>setting('g_last_sheet_export'),'driveAuto'=>setting('g_auto_drive_entregas')==='1','driveFolder'=>setting('g_drive_folder_id'),'planilhaModulos'=>setting('g_sheet_modules',implode(',',GSHEET_DEFAULT_MODULES))],
            'redirectUris'=>['meta'=>publicUrl().'/api/integrations/meta/callback','google'=>publicUrl().'/api/integrations/google/callback'],
            'cron'=>'php '.dirname(__DIR__).'/cron_integracoes.php']);
    }
    case $path==='/integrations/settings' && $method==='POST': {
        $u=requireManager();$in=body();stepUp($u,$in);
        foreach(['meta_app_id','meta_app_secret','g_client_id','g_client_secret'] as $k){if(isset($in[$k])&&trim(strv($in[$k]))!=='')setSetting($k,trim(strv($in[$k])));}
        if(isset($in['g_auto_drive_entregas']))setSetting('g_auto_drive_entregas',!empty($in['g_auto_drive_entregas'])?'1':'0');
        if(isset($in['g_sheet_modules'])){$mm=array_values(array_filter(array_map('trim',explode(',',strv($in['g_sheet_modules']))),fn($m)=>isset(MODULES[$m])));setSetting('g_sheet_modules',implode(',',$mm));}
        audit($u['codigo'],'integracoes-config');out(['ok'=>true]);
    }
    case $path==='/integrations/meta/connect': {requireManager();ensureIntegrationSchema();header('Location: '.metaConnectUrl());http_response_code(302);exit;}
    case $path==='/integrations/google/connect': {requireManager();ensureIntegrationSchema();header('Location: '.gConnectUrl());http_response_code(302);exit;}
    case $path==='/integrations/meta/token' && $method==='POST': {
        $u=requireManager();$in=body();stepUp($u,$in);$tok=trim(strv($in['token']??''));if($tok==='')fail(400,'Informe o token.');
        setSetting('meta_token',$tok);setSetting('meta_token_expira','0');
        try{if(trim(strv($in['ig_user_id']??''))!==''){setSetting('ig_user_id',trim(strv($in['ig_user_id'])));}else{metaDiscoverAccount();}}catch(Throwable $e){fail(400,$e->getMessage());}
        audit($u['codigo'],'instagram-token-manual');out(['ok'=>true]);
    }
    case $path==='/integrations/meta/disconnect' && $method==='POST': {$u=requireManager();stepUp($u,body());foreach(['meta_token','meta_token_expira','ig_user_id','ig_username','meta_page_name'] as $k)setSetting($k,'');audit($u['codigo'],'instagram-desconectado');out(['ok'=>true]);}
    case $path==='/integrations/google/disconnect' && $method==='POST': {$u=requireManager();stepUp($u,body());foreach(['g_refresh_token','g_access_token','g_access_expira','g_email'] as $k)setSetting($k,'');audit($u['codigo'],'google-desconectado');out(['ok'=>true]);}
    case $path==='/integrations/instagram/sync' && $method==='POST': {
        $u=requireManager();try{metaRefreshIfNeeded();$n=igSync();}catch(Throwable $e){intLog('instagram','erro',$e->getMessage());fail(502,$e->getMessage());}
        out(['periodos'=>$n]);
    }
    case $path==='/integrations/instagram/queue': {
        requireInternal();ensureIntegrationSchema();$st=[];foreach(q('SELECT * FROM ig_publish')->fetchAll() as $s)$st[$s['conteudo_id']]=$s;$o=[];
        foreach(listRows('conteudos') as $r){
            if(($r['publicarInstagram']??'')!=='SIM')continue;
            $s=$st[$r['id']]??null;
            $o[]=['id'=>$r['id'],'titulo'=>$r['titulo']??'','status'=>$r['status']??'','publicacaoEm'=>$r['publicacaoEm']??'','formato'=>$r['formato']??'','midia'=>$r['midiaInstagram']??'','publicado'=>!empty($r['instagramMediaId']),'link'=>$r['instagramLink']??'','estado'=>$s['status']??'','erro'=>$s['erro']??''];
        }
        out($o);
    }
    case $path==='/integrations/instagram/media' && $method==='POST': {$u=requireInternal();$rel=igSaveMedia(qs('id'));audit($u['codigo'],'instagram-midia','conteudos',qs('id'));out(['midia'=>$rel]);}
    case $path==='/integrations/instagram/publish' && $method==='POST': {
        $u=requireInternal();$in=body();
        try{$r=igPublish(strv($in['id']??''),$u['codigo']);}catch(Throwable $e){
            igMarkError(strv($in['id']??''),$e->getMessage());
            intLog('instagram','erro',$e->getMessage());fail(502,$e->getMessage());}
        audit($u['codigo'],'instagram-publicado','conteudos',strv($in['id']??''));out($r);
    }
    case $path==='/integrations/google/calendar/sync' && $method==='POST': {requireManager();try{out(gCalendarSync());}catch(Throwable $e){intLog('google','erro',$e->getMessage());fail(502,$e->getMessage());}}
    case $path==='/integrations/google/sheets/export' && $method==='POST': {requireManager();try{$r=gSheetsExport();out(['abas'=>$r,'url'=>setting('g_sheet_url')]);}catch(Throwable $e){intLog('google','erro',$e->getMessage());fail(502,$e->getMessage());}}
    case $path==='/integrations/google/drive/send-entregas' && $method==='POST': {
        requireManager();$n=0;
        try{foreach(listRows('solicitacoes') as $r){if(!empty($r['arquivosEntrega']))$n+=gDriveSendEntregas($r['id']);}}catch(Throwable $e){intLog('google','erro',$e->getMessage());fail(502,$e->getMessage());}
        out(['arquivos'=>$n]);
    }
    case $path==='/integrations/log': {requireManager();ensureIntegrationSchema();out(q('SELECT quando,servico,nivel,msg FROM integration_log ORDER BY id DESC LIMIT 40')->fetchAll());}

    // ---------- Portal do Solicitante ----------
    case $path==='/portal/login' && $method==='POST': {
        $in=body();$cod=strtoupper(trim((string)($in['codigo']??'')));$sen=(string)($in['senha']??'');
        if(loginMode()==='codigo'){
            codeLoginGuard();
            $u=validCodeFormat($cod)?q('SELECT * FROM portal_users WHERE acesso_hmac=? AND ativo=1',[accessHmac($cod)])->fetch():false;
            if(!$u)codeLoginFail('?');
            $tok=startSession('por',$u['codigo']);audit($u['codigo'],'portal-login');registerDevice('por',$u['codigo'],$u['nome']);
            out(['token'=>$tok,'mustChange'=>false,'user'=>['id'=>$u['codigo'],'codigo'=>$u['codigo'],'nome'=>$u['nome'],'perfil'=>$u['perfil'],'segmentos'=>json_decode($u['segmentos'],true),'ativo'=>true]]);
        }
        $key='por|'.ip().'|'.$cod;rateCheck($key);rateCheck('ip|'.ip(),40);
        $u=q('SELECT * FROM portal_users WHERE codigo=? AND ativo=1',[$cod])->fetch();
        if(!$u||!password_verify($sen,$u['pass_hash'])){rateFail($key);rateFail('ip|'.ip());audit($cod?:'?','portal-login-falhou');fail(401,'Código ou senha inválidos.');}
        $tok=startSession('por',$cod);audit($cod,'portal-login');
        out(['token'=>$tok,'mustChange'=>(bool)$u['must_change'],'user'=>['id'=>$u['codigo'],'codigo'=>$u['codigo'],'nome'=>$u['nome'],'perfil'=>$u['perfil'],'segmentos'=>json_decode($u['segmentos'],true),'ativo'=>true]]);
    }
    case $path==='/portal/password' && $method==='POST': {
        $u=requirePortal();$in=body();
        $row=q('SELECT pass_hash FROM portal_users WHERE codigo=?',[$u['codigo']])->fetch();
        if(!password_verify((string)($in['atual']??''),$row['pass_hash']))fail(403,'Senha atual incorreta.');
        strongPassword((string)($in['nova']??''));
        q('UPDATE portal_users SET pass_hash=?,must_change=0 WHERE codigo=?',[password_hash((string)$in['nova'],PASSWORD_DEFAULT),$u['codigo']]);
        out(['ok'=>true]);
    }
    case $path==='/admin/users': {
        requireManager();$o=[];
        foreach(q('SELECT codigo,nome,role,label,ativo,must_change FROM users ORDER BY codigo') as $r){$o[]=['tipo'=>'interno','codigo'=>$r['codigo'],'nome'=>$r['nome'],'perfil'=>$r['label'],'ativo'=>(bool)$r['ativo'],'trocarSenha'=>(bool)$r['must_change'],'pediuReset'=>pediuReset($r['codigo']),'email'=>emailForPerson($r['nome'])];}
        foreach(q('SELECT codigo,nome,perfil,segmentos,ativo,must_change FROM portal_users ORDER BY codigo') as $r){$o[]=['tipo'=>'portal','codigo'=>$r['codigo'],'nome'=>$r['nome'],'perfil'=>implode(', ',json_decode($r['segmentos'],true)),'ativo'=>(bool)$r['ativo'],'trocarSenha'=>(bool)$r['must_change'],'pediuReset'=>pediuReset($r['codigo']),'email'=>''];}
        out($o);
    }
    case $path==='/admin/user-active' && $method==='POST': {
        $m=requireManager();$in=body();stepUp($m,$in);$tipo=(string)($in['tipo']??'');$cod=strtoupper(trim((string)($in['codigo']??'')));$on=!empty($in['ativo'])?1:0;
        $tab=$tipo==='portal'?'portal_users':($tipo==='interno'?'users':fail(400,'Tipo inválido.'));
        if($tipo==='interno'&&$cod===$m['codigo']&&!$on)fail(400,'Você não pode desativar o próprio acesso.');
        if(!q("SELECT 1 FROM $tab WHERE codigo=?",[$cod])->fetch())fail(404,'Usuário não encontrado.');
        q("UPDATE $tab SET ativo=? WHERE codigo=?",[$on,$cod]);if(!$on)q('DELETE FROM sessions WHERE codigo=?',[$cod]);
        audit($m['codigo'],($on?'ativar:':'desativar:').$cod);out(['ok'=>true]);
    }
    case $path==='/auth/mode': {out(['modo'=>loginMode()]);}
    case $path==='/admin/mode' && $method==='POST': {
        $m=requireManager();$in=body();$novo=($in['modo']??'')==='codigo'?'codigo':(($in['modo']??'')==='senha'?'senha':fail(400,'Modo inválido.'));
        ensureAccessSchema();
        if(loginMode()==='codigo')stepUp($m,$in);
        else{
            // ao ligar o modo por código, confirma a senha de administração agora (a Gerente acabou de entrar com senha)
            $row=q('SELECT pass_hash FROM users WHERE codigo=?',[$m['codigo']])->fetch();
            if(!password_verify((string)($in['senhaAdmin']??''),$row['pass_hash']))fail(403,'Confirme sua senha de administração.');
        }
        $codes=[];
        if($novo==='codigo'){
            foreach(q('SELECT codigo,nome FROM users WHERE ativo=1 ORDER BY codigo')->fetchAll() as $r)$codes[]=['tipo'=>'interno','codigo'=>$r['codigo'],'nome'=>$r['nome'],'acesso'=>issueAccessCode('users',$r['codigo'])];
            foreach(q('SELECT codigo,nome FROM portal_users WHERE ativo=1 ORDER BY codigo')->fetchAll() as $r)$codes[]=['tipo'=>'portal','codigo'=>$r['codigo'],'nome'=>$r['nome'],'acesso'=>issueAccessCode('portal_users',$r['codigo'])];
            q('UPDATE users SET must_change=0 WHERE role<>?',['manager']);
            q('DELETE FROM sessions WHERE codigo<>?',[$m['codigo']]);
        }
        setSetting('login_modo',$novo);audit($m['codigo'],'modo-acesso:'.$novo);
        out(['modo'=>$novo,'codigos'=>$codes]);
    }
    case $path==='/admin/seed-equipe' && $method==='POST': {$m=requireManager();out(['criados'=>seedEquipe($m['codigo'])]);}
    case $path==='/auth/forgot' && $method==='POST': {
        $in=body();$cod=strtoupper(trim((string)($in['codigo']??'')));$tipo=(($in['tipo']??'')==='portal')?'portal':'int';
        rateCheck('forgot|'.ip(),10);rateFail('forgot|'.ip());
        $tab=$tipo==='portal'?'portal_users':'users';$u=$cod!==''?q("SELECT nome FROM $tab WHERE codigo=? AND ativo=1",[$cod])->fetch():false;
        if($u){audit($cod,'esqueci-senha');notifyMail('Pedido de redefinição de senha',"{$u['nome']} ($cod) pediu a redefinição da senha.\nEntre em Administração → Acessos e gere uma senha temporária.");}
        out(['ok'=>true,'mensagem'=>'Se o código existir, a Gerente foi avisada e vai gerar uma senha temporária para você.']);
    }
    case $path==='/admin/audit': {
        requireManager();$lim=min(500,max(10,(int)qs('limit')?:100));
        out(q('SELECT quando,ator,acao,modulo,registro,ip FROM audit_log ORDER BY id DESC LIMIT '.$lim)->fetchAll());
    }
    case $path==='/manager/notices/remove' && $method==='POST': {
        $u=requireManager();$in=body();$id=(string)($in['id']??'');q('DELETE FROM notices WHERE id=?',[$id]);audit($u['codigo'],'aviso-removido',$id);out(['ok'=>true]);
    }
    case $path==='/portal/notices': {
        $u=requirePortal();$o=[];
        foreach(q('SELECT data FROM notices') as $r){
            $n=json_decode($r['data'],true);if(empty($n['ativo']))continue;
            $segs=$n['segmentos']??[];$ok=!$segs;
            foreach($segs as $s){if($s==='*'||allowedSegment($u,(string)$s))$ok=true;}
            if($ok)$o[]=$n;
        }
        usort($o,fn($a,$b)=>strcmp($b['criadoEm']??'',$a['criadoEm']??''));
        out(['rows'=>$o]);
    }
    case $path==='/manager/notices': {
        $u=requireManager();
        if($method==='GET'){$o=[];foreach(q('SELECT data FROM notices') as $r)$o[]=json_decode($r['data'],true);out(['rows'=>$o]);}
        $in=cleanInput(body());$id=$in['id']??('AVI-'.bin2hex(random_bytes(6)));
        $n=['id'=>$id,'titulo'=>$in['titulo']??'','mensagem'=>$in['mensagem']??'','segmentos'=>array_values(array_filter(array_map('trim',explode(',',$in['segmentos']??'')))),'ativo'=>($in['ativo']??'true')!=='false','criadoEm'=>now()];
        if(trim($n['titulo'])==='')fail(400,'Informe o título do aviso.');
        q('DELETE FROM notices WHERE id=?',[$id]);q('INSERT INTO notices(id,data) VALUES(?,?)',[$id,json_encode($n,JSON_UNESCAPED_UNICODE)]);audit($u['codigo'],'aviso',$id);out($n);
    }
    case $path==='/portal/requests': {
        $u=requirePortal();
        if($method==='GET'){
            $o=[];foreach(listRows('solicitacoes') as $r)if(allowedSegment($u,$r['segmento']??''))$o[]=publicRow($r);
            out(['rows'=>$o]);
        }
        if($method!=='POST')fail(405,'Método não permitido.');
        $in=body();$seg=strv($in['segmento']??'');
        allowedSegment($u,$seg)||fail(403,'Segmento não autorizado.');
        if(trim(strv($in['titulo']??''))===''||trim(strv($in['objetivo']??''))==='')fail(400,'Título e objetivo são obrigatórios.');
        if(strcasecmp(strv($in['prioridade']??''),'URGENTE')===0&&trim(strv($in['motivoUrgencia']??''))==='')fail(400,'Motivo da urgência é obrigatório.');
        $row=['titulo'=>strv($in['titulo']),'status'=>'AGUARDANDO TRIAGEM','prioridade'=>strv($in['prioridade']??''),'segmento'=>$seg,'prazo'=>strv($in['prazo']??''),'descricao'=>strv($in['objetivo']),'origem'=>'PORTAL_SOLICITANTE','solicitante'=>$u['nome'],'triagemStatus'=>'AGUARDANDO TRIAGEM','gerenteTriagem'=>'Gerente de Marketing'];
        foreach(CREATE_FIELDS as $k)if(array_key_exists($k,$in))$row[$k]=strv($in[$k]);
        if(trim($row['solicitanteNome']??'')!=='')$row['solicitante']=$row['solicitanteNome'];
        if(($row['aprovacaoSolicitante']??'')==='')$row['aprovacaoSolicitante']='PENDENTE';
        $novo=insertRow('solicitacoes',$row,'portal:'.$u['codigo']);
        notifyMail('Nova demanda: '.$novo['titulo'],"Solicitante: {$novo['solicitante']}\nSegmento: {$novo['segmento']}\nPrioridade: {$novo['prioridade']}\nPrazo desejado: {$novo['prazo']}\nID: {$novo['id']}");
        out(publicRow($novo),201);
    }
    case $path==='/portal/upload' && $method==='POST': {
        $u=requirePortal();$id=qs('id');$row=getRow('solicitacoes',$id)??fail(404,'Demanda não encontrada.');
        allowedSegment($u,$row['segmento']??'')||fail(403,'Demanda de outro segmento.');
        $saved=saveUploads($id,'');
        $cur=array_filter(array_map('trim',explode('|',$row['anexos']??'')));
        $row['anexos']=implode(' | ',array_merge($cur,$saved));$row['atualizadoEm']=now();saveRow('solicitacoes',$row);
        audit('portal:'.$u['codigo'],'upload','solicitacoes',$id);out(['files'=>$saved]);
    }
    case $path==='/portal/file': {$u=requirePortal();serveFile(qs('path'),$u);}
    default: fail(404,'Rota não encontrada.');
    }
}catch(HttpError $e){
    out(['error'=>$e->getMessage()],$e->status);
}catch(Throwable $e){
    @file_put_contents(__DIR__.'/../storage/erro.log',date('c').' '.$e."\n",FILE_APPEND);
    out(['error'=>'Erro interno do servidor.'],500);
}

function checkCsrfOrPortal(string $path):void{
    // Rotas públicas de login e chamadas do Portal (token em cabeçalho) não dependem de cookie.
    if($path==='/auth/login'||$path==='/portal/login'||$path==='/auth/forgot')return;
    if(isset($_SERVER['HTTP_X_PORTAL_TOKEN'])&&portalUser()!==null&&internalUser()===null)return;
    checkCsrf();
}
function portalRestrictedUpdate(array $u,string $method,string $mod,string $id):never{
    if($method!=='PUT')fail(403,'Operação não permitida ao Portal.');
    if($mod!=='solicitacoes')fail(403,'Módulo não permitido.');
    $in=body();$row=getRow('solicitacoes',$id)??fail(404,'Demanda não encontrada.');
    allowedSegment($u,$row['segmento']??'')||fail(403,'Demanda de outro segmento.');
    $cur=mb_strtoupper(($row['status']??'').' '.($row['triagemStatus']??''));
    $nota=trim(strv($in['avaliacaoNota']??''));
    if($nota!==''){
        if(!str_contains($cur,'CONCLUÍDA'))fail(409,'A avaliação só pode ser enviada após a conclusão.');
        if(!ctype_digit($nota)||(int)$nota<1||(int)$nota>5)fail(400,'Avaliação deve estar entre 1 e 5.');
    }
    foreach(UPDATE_FIELDS as $k)if(array_key_exists($k,$in))$row[$k]=strv($in[$k]);
    $ap=mb_strtoupper(trim($row['aprovacaoSolicitante']??''));$t=now();
    $traz=fn(string $k)=>array_key_exists($k,$in);  // só avalia transições quando o pedido traz o campo (avaliação posterior à aprovação não é nova aprovação)
    if($traz('aprovacaoSolicitante')&&$ap==='APROVADO'){
        str_contains($cur,'AGUARDANDO APROVAÇÃO')||fail(409,'Esta demanda não está aguardando aprovação.');
        $row['status']='CONCLUÍDA';$row['triagemStatus']='CONCLUÍDA';if(($row['aprovadoSolicitanteEm']??'')==='')$row['aprovadoSolicitanteEm']=$t;
    }elseif($traz('aprovacaoSolicitante')&&$ap==='AJUSTES SOLICITADOS'){
        str_contains($cur,'AGUARDANDO APROVAÇÃO')||fail(409,'Esta demanda não está aguardando aprovação.');
        $row['status']='EM EXECUÇÃO';$row['triagemStatus']='DISTRIBUÍDA';if(($row['respondidoSolicitanteEm']??'')==='')$row['respondidoSolicitanteEm']=$t;
    }elseif($traz('respostaSolicitante')&&trim($row['respostaSolicitante']??'')!==''){
        (str_contains($cur,'AGUARDANDO SOLICITANTE')||str_contains($cur,'DEVOLVIDA PARA AJUSTES'))||fail(409,'Esta demanda não está aguardando resposta.');
        $row['status']='EM ANÁLISE';$row['triagemStatus']='EM TRIAGEM';if(($row['respondidoSolicitanteEm']??'')==='')$row['respondidoSolicitanteEm']=$t;
    }
    $row['atualizadoEm']=$t;saveRow('solicitacoes',$row);audit('portal:'.$u['codigo'],'editar','solicitacoes',$id);
    if($ap==='APROVADO'||$ap==='AJUSTES SOLICITADOS')notifyMail('Demanda '.($ap==='APROVADO'?'aprovada':'com ajustes solicitados').': '.($row['titulo']??$id),'ID: '.$id.' · Segmento: '.($row['segmento']??''));
    out(['ok'=>true]);
}
function saveUploads(string $id,string $sub):array{
    if(empty($_FILES['files']))return [];
    $f=$_FILES['files'];$n=is_array($f['name'])?count($f['name']):1;$max=((int)(cfg()['max_upload_mb']??20))*1048576;$saved=[];
    $rel='ANEXOS/SOLICITACOES/'.safePart($id).($sub!==''?'/'.$sub:'');$dir=__DIR__.'/../storage/'.$rel;
    if(!is_dir($dir)&&!mkdir($dir,0750,true))fail(500,'Não foi possível criar a pasta de anexos.');
    for($i=0;$i<$n;$i++){
        $name=is_array($f['name'])?$f['name'][$i]:$f['name'];$tmp=is_array($f['tmp_name'])?$f['tmp_name'][$i]:$f['tmp_name'];
        $err=is_array($f['error'])?$f['error'][$i]:$f['error'];$size=is_array($f['size'])?$f['size'][$i]:$f['size'];
        if($err!==UPLOAD_ERR_OK)fail(400,'Falha no envio do arquivo (tamanho acima do permitido pelo servidor?).');
        if($size>$max)fail(413,'Arquivo acima do limite de '.(int)($max/1048576).' MB.');
        $base=safePart(basename($name))?:'arquivo';$ext=strtolower(pathinfo($base,PATHINFO_EXTENSION));
        if(!in_array($ext,ALLOWED_EXT,true))fail(400,"Tipo de arquivo não permitido: .$ext");
        $dst="$dir/$base";if(file_exists($dst))$dst="$dir/".pathinfo($base,PATHINFO_FILENAME).'_'.bin2hex(random_bytes(4)).'.'.$ext;
        move_uploaded_file($tmp,$dst)||rename($tmp,$dst)||fail(500,'Não foi possível gravar o arquivo.');
        $saved[]=$rel.'/'.basename($dst);
    }
    return $saved;
}
function serveFile(string $rel,?array $portal):never{
    $rel=str_replace('\\','/',trim($rel));
    if($rel===''||str_contains($rel,'..')||!str_starts_with($rel,'ANEXOS/SOLICITACOES/'))fail(400,'Arquivo inválido.');
    if($portal){
        $ok=false;
        foreach(listRows('solicitacoes') as $r){
            if(!allowedSegment($portal,$r['segmento']??''))continue;
            foreach(explode('|',($r['anexos']??'').' | '.($r['arquivosEntrega']??'')) as $x){if(str_replace('\\','/',trim($x))===$rel){$ok=true;break 2;}}
        }
        $ok||fail(403,'Arquivo não autorizado.');
    }
    $base=realpath(__DIR__.'/../storage/ANEXOS/SOLICITACOES');$fp=realpath(__DIR__.'/../storage/'.$rel);
    if(!$base||!$fp||!str_starts_with($fp,$base.DIRECTORY_SEPARATOR)||!is_file($fp))fail(404,'Arquivo não encontrado.');
    $mime=['pdf'=>'application/pdf','png'=>'image/png','jpg'=>'image/jpeg','jpeg'=>'image/jpeg','gif'=>'image/gif','webp'=>'image/webp','mp4'=>'video/mp4','txt'=>'text/plain'][strtolower(pathinfo($fp,PATHINFO_EXTENSION))]??'application/octet-stream';
    header_remove('Content-Type');header('Content-Type: '.$mime);header('Content-Disposition: inline; filename="'.basename($fp).'"');header('X-Content-Type-Options: nosniff');header("Content-Security-Policy: sandbox");
    readfile($fp);exit;
}

function pediuReset(string $cod):bool{
    $a=q("SELECT MAX(id) m FROM audit_log WHERE ator=? AND acao='esqueci-senha'",[$cod])->fetch()['m']??null;if(!$a)return false;
    $b=q('SELECT MAX(id) m FROM audit_log WHERE acao=?',['reset-senha:'.$cod])->fetch()['m']??null;
    return !$b||(int)$a>(int)$b;
}

<?php
declare(strict_types=1);
/**
 * Alertas diários de prazo por e-mail (rode pelo "Cron Jobs" do hPanel, 1x/dia, ex. 8h):
 *   php /home/SEU_USUARIO/public_html/cron_alertas.php
 * Envia: (1) a cada pessoa com e-mail na ficha de Equipe, os itens dela atrasados/vencendo hoje ou amanhã;
 *        (2) à Gerente (notify_to), o resumo geral. Só roda pela linha de comando.
 */
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/api/lib.php';
date_default_timezone_set(cfg()['timezone']??'America/Recife');
$hoje=date('Y-m-d');$amanha=date('Y-m-d',strtotime('+1 day'));
$FECHADOS='/CONCLU|PUBLICADO|APROVADO|CANCEL|ARQUIV|ENTREGUE|FINAL/i';
$itens=[];
foreach(['solicitacoes','tarefas','projetos','conteudos','eventos'] as $mod){
    foreach(listRows($mod) as $r){
        if(preg_match($FECHADOS,($r['status']??'').' '.($r['triagemStatus']??'')))continue;
        $due=substr(($mod==='solicitacoes'?($r['prazoNegociado']??'')?:($r['prazoSLA']??'')?:($r['prazo']??''):($r['prazo']??($r['dataInicio']??''))),0,10);
        if($due===''||$due>$amanha)continue;
        $itens[]=['mod'=>$mod,'titulo'=>$r['titulo']??$r['id'],'due'=>$due,'resp'=>trim($r['responsavel']??''),'atraso'=>$due<$hoje];
    }
}
if(!$itens){echo "Sem itens para avisar.\n";exit;}
$linha=fn($i)=>sprintf("- [%s] %s — %s%s",$i['mod'],$i['titulo'],$i['atraso']?'ATRASADO desde ':'vence ',date('d/m/Y',strtotime($i['due'])).($i['resp']?" ({$i['resp']})":''));
$porPessoa=[];foreach($itens as $i)if($i['resp']!=='')$porPessoa[$i['resp']][]=$i;
$enviados=0;
foreach($porPessoa as $nome=>$lista){
    $to=emailForPerson($nome);if($to==='')continue;
    notifyMail('Seus prazos de hoje',"Olá, $nome!\n\n".implode("\n",array_map($linha,$lista))."\n\nAcesse o EVO MKT para atualizar.",$to);$enviados++;
}
usort($itens,fn($a,$b)=>strcmp($a['due'],$b['due']));
notifyMail('Resumo de prazos ('.count($itens).' itens)',implode("\n",array_map($linha,$itens)));
echo "Alertas: $enviados pessoa(s) + resumo da Gerente.\n";

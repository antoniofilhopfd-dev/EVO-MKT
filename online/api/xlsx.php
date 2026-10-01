<?php
declare(strict_types=1);
const XL_NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
/** Leitor mínimo de XLSX (primeira planilha) usando apenas ZipArchive + SimpleXML. Retorna [cabecalhos, linhas[]]. */
function readXlsx(string $file):array{
    $z=new ZipArchive();
    if($z->open($file)!==true)throw new RuntimeException("Não foi possível abrir $file");
    $shared=[];
    if(($x=$z->getFromName('xl/sharedStrings.xml'))!==false){
        $sx=simplexml_load_string($x);
        foreach($sx->children(XL_NS)->si as $si){$t='';if(isset($si->t))$t=(string)$si->t;else foreach($si->r as $r)$t.=(string)$r->t;$shared[]=$t;}
    }
    $sheet=$z->getFromName('xl/worksheets/sheet1.xml');
    if($sheet===false){$z->close();throw new RuntimeException("Planilha 1 ausente em $file");}
    $z->close();
    $sx=simplexml_load_string($sheet);$rows=[];
    foreach($sx->children(XL_NS)->sheetData->row as $r){
        $line=[];
        foreach($r->c as $c){$c=$c;
            preg_match('/^([A-Z]+)/',(string)$c->attributes()['r'],$m);$col=0;foreach(str_split($m[1]) as $ch)$col=$col*26+(ord($ch)-64);$col--;
            $t=(string)$c->attributes()['t'];
            if($t==='s')$v=$shared[(int)$c->v]??'';
            elseif($t==='inlineStr')$v=(string)$c->is->t;
            else $v=(string)$c->v;
            $line[$col]=$v;
        }
        $rows[]=$line;
    }
    if(!$rows)return [[],[]];
    $hdr=[];foreach($rows[0] as $i=>$h)if(trim($h)!=='')$hdr[$i]=trim($h);
    $out=[];
    foreach(array_slice($rows,1) as $line){
        $rec=[];foreach($hdr as $i=>$h)$rec[$h]=trim((string)($line[$i]??''));
        if(array_filter($rec,fn($v)=>$v!==''))$out[]=$rec;
    }
    return [array_values($hdr),$out];
}

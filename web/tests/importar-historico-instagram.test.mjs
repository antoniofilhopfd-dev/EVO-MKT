import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

test('Instagram: manifesto válido roda em simulação sem banco de dados', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evo-ig-test-'));
  try {
    const manifesto = { versao:'1.0', abas:[{arquivo:'teste.xlsx',aba:'Feed',linhas_com_dados:2}], conteudo:{'teste.xlsx':{'Feed':[
      {row:1,cells:{A:'Data',B:'Visualizações'}},
      {row:2,cells:{A:'2026-01-01',B:'-'}}
    ]}}};
    const arquivo=path.join(temp,'manifesto.json');
    fs.writeFileSync(arquivo,JSON.stringify(manifesto));
    const script=new URL('../scripts/importar-historico-instagram.mjs',import.meta.url).pathname;
    const p=spawnSync(process.execPath,[script,arquivo,'--dry-run'],{encoding:'utf8',env:{...process.env,DB_HOST:'',DB_USER:'',DB_NAME:''}});
    assert.equal(p.status,0,p.stderr);
    assert.match(p.stdout,/"linhas": 2/);
    assert.match(p.stdout,/"modo": "SIMULAÇÃO"/);
    assert.match(p.stdout,/Nenhum dado gravado/);
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});

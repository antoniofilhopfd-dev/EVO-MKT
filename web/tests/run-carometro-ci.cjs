// Banco exclusivo de testes; nunca aceita um nome de banco fora do prefixo evo_cm_test.
const mysql=require('mysql2/promise'),fs=require('node:fs'),{spawn}=require('node:child_process'),path=require('node:path');
(async()=>{
 const db=process.env.DB_NAME||'evo_cm_test';if(!/^evo_cm_test\w*$/.test(db))throw new Error('Use um banco exclusivo evo_cm_test*.');
 const env={...process.env,DB_NAME:db,DB_HOST:process.env.DB_HOST||'127.0.0.1',DB_USER:process.env.DB_USER||'root',DB_PASSWORD:process.env.DB_PASSWORD||'evo-test-password',SESSION_SECRET:'segredo-teste-carometro-01234567890123456789',APP_KEY:'chave-teste-carometro-01234567890123456789',SETUP_KEY:'setup-teste-carometro-0123456789',PUBLIC_URL:'http://127.0.0.1:8080',BASE:'http://127.0.0.1:8080',NODE_ENV:'production',LOGIN_DELAY_MS:'0',LOGIN_GLOBAL_MAX:'500',LOGIN_IP_MAX:'500',MAIL_LOG:'/tmp/evo-cm-mail.log',PLAYWRIGHT:require.resolve('playwright')};
 env.CHROME=process.env.CHROME||require('playwright').chromium.executablePath();
 const sql=await mysql.createConnection({host:env.DB_HOST,user:env.DB_USER,password:env.DB_PASSWORD});
 fs.mkdirSync('test-results',{recursive:true});
 const suites=process.argv.slice(2);if(!suites.length)suites.push('carometro-melhorias-integration','carometro-lote','carometro-sel','carometro-pdf','carometro-drive');
 let fail=false;
 for(const suite of suites){
  if(!/^[a-z0-9-]+$/.test(suite))throw new Error('Suíte inválida.');
  await sql.query(`DROP DATABASE IF EXISTS \`${db}\``);await sql.query(`CREATE DATABASE \`${db}\` CHARACTER SET utf8mb4`);
  const log=fs.openSync(`test-results/${suite}-server.log`,'w');
  const app=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','8080','-H','127.0.0.1'],{env,stdio:['ignore',log,log]});
  try{
   let ready=false;for(let i=0;i<90;i++){try{const r=await fetch(env.BASE+'/api/heartbeat');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}if(!ready)throw new Error('Servidor não iniciou.');
   const setup=await fetch(env.BASE+'/api/setup?key='+env.SETUP_KEY);const body=await setup.text();if(!setup.ok)throw new Error(body);fs.writeFileSync('test-results/install.out',body);
   const code=await new Promise(resolve=>{const child=spawn(process.execPath,[`tests/${suite}.test.js`,'test-results/install.out'],{env,stdio:'inherit'});child.on('exit',resolve);child.on('error',()=>resolve(1));});
   if(code!==0)fail=true;
  }catch(e){console.error(e);fail=true;}finally{app.kill('SIGTERM');if(app.exitCode===null)await new Promise(r=>app.once('exit',r));fs.closeSync(log);}
 }
 await sql.end();process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});

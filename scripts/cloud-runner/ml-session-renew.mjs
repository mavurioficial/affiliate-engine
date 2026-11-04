#!/usr/bin/env node
// Mavuri: owner-operated, occasional Mercado Livre session renewal.
// One-time manual login in a temporary local Chrome profile. No cookies, browser
// tokens, raw session state, or encryption keys are printed or uploaded.
// Export is encrypted locally; the owner manually stores the two parts as
// GitHub Environment Secrets. The temporary browser profile is deleted.
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {packageMavuriAuthState,unpackageMavuriAuthState} from './auth-state.mjs';

const BUILDER='https://www.mercadolivre.com.br/afiliados/linkbuilder#hub';
const ML_HOST='www.mercadolivre.com.br';
const EXPECTED_TAG='lucasbrasildf';

function selfTest(){
 const input={cookies:[{name:'example_ml_session',value:'TEST_NOT_A_REAL_SESSION',
  domain:'.mercadolivre.com.br',path:'/',expires:-1,httpOnly:true,secure:true,sameSite:'Lax'}],
  origins:[]};
 const data=packageMavuriAuthState(input);
 const output=unpackageMavuriAuthState(data.bundle,data.key);
 const ok=output.cookies.length===1 && output.cookies[0].value==='TEST_NOT_A_REAL_SESSION' &&
  output.origins.length===0 && data.stats.ml_cookie_count===1;
 console.log(JSON.stringify({mode:'self_test',ok,uses_real_session:false,
   secure_bundle_supported:ok,no_publication:true}));
 if(!ok)process.exitCode=1;
}

async function capture(){
 if(!process.stdin.isTTY)throw Error('interactive_local_terminal_required');
 const {chromium}=await import('playwright-core');
 const profile=await mkdtemp(join(tmpdir(),'mavuri-ml-login-'));
 let context;
 const terminal=createInterface({input:process.stdin,output:process.stdout});
 try{
  context=await chromium.launchPersistentContext(profile,{
   channel:'chrome',headless:false,viewport:{width:1250,height:850},
   args:['--disable-background-networking']
  });
  const page=context.pages()[0]||await context.newPage();
  await page.goto(BUILDER,{waitUntil:'domcontentloaded',timeout:25000});
  console.log('Chrome temporario aberto somente para seu login Mercado Livre.');
  console.log('Entre na Central, confirme que a etiqueta em uso e '+EXPECTED_TAG+'.');
  console.log('Nao forneca cookies, tokens ou senhas no terminal ou nesta conversa.');
  await terminal.question('Apos entrar na Central de Afiliados e confirmar a etiqueta, pressione ENTER aqui: ');
  let main=context.pages().find(p=>{
   try{return new URL(p.url()).hostname===ML_HOST &&
    new URL(p.url()).pathname.startsWith('/afiliados/linkbuilder')}catch{return false}
  });
  if(!main)main=page;
  await main.goto(BUILDER,{waitUntil:'domcontentloaded',timeout:25000});
  if(!main.url().startsWith('https://'+ML_HOST+'/afiliados/linkbuilder'))
   throw Error('linkbuilder_auth_navigation_unavailable');
  const tagSeen=await main.getByText(EXPECTED_TAG,{exact:true}).first()
   .waitFor({state:'visible',timeout:12000}).then(()=>true,()=>false);
  if(!tagSeen)throw Error('affiliate_tag_not_confirmed_in_linkbuilder');
  const state=await context.storageState();
  const bundle=packageMavuriAuthState({cookies:state.cookies,origins:[]});
  if(bundle.stats.ml_cookie_count===0)throw Error('no_ml_cookies_captured');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const target=join(homedir(),'MavuriCloudAuth','ml-'+stamp+'-'+randomBytes(3).toString('hex'));
  await mkdir(target,{recursive:true,mode:0o700});
  const b=join(target,'MAVURI_ML_AUTH_BUNDLE.txt');
  const k=join(target,'MAVURI_ML_AUTH_KEY.txt');
  await writeFile(b,bundle.bundle,{flag:'wx',mode:0o600});
  await writeFile(k,bundle.key,{flag:'wx',mode:0o600});
  console.log(JSON.stringify({ok:true,tag_confirmed:true,
    ml_cookie_count:bundle.stats.ml_cookie_count,
    output_files:[b,k],no_publication:true,
    instructions:'Store each file value in the matching GitHub environment secret. Do not share values in chat or commits.'},null,2));
 }finally{
  terminal.close();
  try{await context?.close()}catch{}
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:500}).catch(()=>{
   console.error('Aviso: remova manualmente o perfil temporario '+profile);
  });
 }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const mode=process.argv[2];
 if(mode==='--self-test')selfTest();
 else if(mode==='capture')capture().catch(e=>{
  console.error('Captura nao concluida: '+String(e?.message||'unknown').slice(0,120));
  process.exitCode=1;
 });
 else{console.error('Uso: node scripts/cloud-runner/ml-session-renew.mjs --self-test | capture');process.exitCode=2;}
}

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
 throw Error('ml_automated_login_suspended_due_to_account_rate_limit');
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

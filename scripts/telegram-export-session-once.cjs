'use strict';
const {TelegramClient}=require('teleproto');
const {StringSession}=require('teleproto/sessions');
const input=require('input');
const {spawnSync}=require('node:child_process');
(async()=>{
 const apiId=Number(await input.text('Seu API ID:'));
 const apiHash=String(await input.password('Seu API Hash (oculto):')).trim();
 if(!Number.isSafeInteger(apiId)||apiId<=0||!/^[0-9a-f]{32}$/i.test(apiHash))throw Error('API invalida');
 const client=new TelegramClient(new StringSession(''),apiId,apiHash,{connectionRetries:3});
 try{
  await client.start({
   phoneNumber:()=>input.text('Telefone com +55:'),
   phoneCode:()=>input.password('Codigo Telegram (oculto):'),
   password:()=>input.password('Senha 2FA (oculta):'),
   onError:()=>process.stderr.write('Erro de autenticacao. Reveja os dados no terminal.\n')
  });
  const session=client.session.save();
  if(typeof session!=='string'||session.length<40||session.length>4096)throw Error('Sessao invalida');
  const clip=spawnSync('clip.exe',[],{input:session,encoding:'utf8',windowsHide:true});
  if(clip.error||clip.status!==0)throw Error('Falha ao copiar a sessao');
  console.log('Sessao copiada. Cole SOMENTE no segredo TG_SESSION_STRING do GitHub; nunca neste chat.');
 }finally{await client.disconnect().catch(()=>{});}
})().catch(e=>{console.error('Falhou:',e?.name||'erro');process.exitCode=1});

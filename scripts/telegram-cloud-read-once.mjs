import {TelegramClient} from 'teleproto';
import {StringSession} from 'teleproto/sessions';
const hosts=new Map([['meli.la','mercadolivre'],['merc.li','mercadolivre'],['www.mercadolivre.com.br','mercadolivre'],['mercadolivre.com.br','mercadolivre'],['link.amazon','amazon'],['amzn.to','amazon'],['a.co','amazon'],['amazon.com.br','amazon'],['www.amazon.com.br','amazon']]);
export function countLinks(text=''){
 const counts={amazon:0,mercadolivre:0};
 for(const match of String(text).match(/https?:\\/\\/[^\\s<>\"'()[\\]]+/giu)||[]){
  try{const u=new URL(match.replace(/[.,;!?]+$/g,''));const shop=hosts.get(u.hostname.toLowerCase());if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&shop)counts[shop]++;}catch{}
 }
 return counts;
}
async function run(){
 const id=Number(process.env.TG_API_ID||0),hash=process.env.TG_API_HASH||'',session=process.env.TG_SESSION_STRING||'';
 if(!Number.isSafeInteger(id)||id<1||!/^[a-f0-9]{32}$/i.test(hash)||session.length<40)throw Error('Os 3 secrets de Telegram precisam ser configurados');
 const client=new TelegramClient(new StringSession(session),id,hash,{connectionRetries:2,receiveUpdates:false});
 try{
  await client.connect();
  if(!await client.getMe())throw Error('Sessao nao autenticada');
  const dialogs=await client.getDialogs({limit:500});
  const group=dialogs.find(d=>String(d?.entity?.username||'').toLowerCase()==='grupotabugado');
  if(!group)throw Error('Grupo nao encontrado entre conversas ja acessiveis');
  const recent=await client.getMessages(group.entity,{limit:3});
  const counts={amazon:0,mercadolivre:0};let linked=0;
  for(const message of recent){const found=countLinks(message?.message||'');counts.amazon+=found.amazon;counts.mercadolivre+=found.mercadolivre;if(found.amazon+found.mercadolivre)linked++;}
  console.log(JSON.stringify({result:'cloud_read_ok',source:'@GRUPOTABUGADO',messages:recent.length,messages_with_links:linked,links:counts,saved:false,published:false},null,2));
 }finally{await client.disconnect().catch(()=>{});}
}
if(import.meta.url===new URL('file://'+process.argv[1]).href)run().catch(e=>{console.error('Falha no diagnostico:',e?.name||'erro');process.exitCode=1});

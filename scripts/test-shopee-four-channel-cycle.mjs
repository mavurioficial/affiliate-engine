import {planFourChannelCycle} from "../supabase/functions/discovery-cloud-shopee-diagnostic/cycle-plan.mjs";
const check=(cond,msg)=>{if(!cond)throw Error(msg);};
const now=Date.parse("2026-10-23T18:00:00Z");
const channelNames=["Mavuri Ofertas","Mavuri Mulher","Mavuri Casa & Cozinha","Mavuri Tecnologia"];
const channels=channelNames.map((name,i)=>({id:"ch"+i,name,user_id:"u",status:"connected",type:"telegram",external_ref:"test-ref"}));
const rules=[
 {enabled:true,conditions:{marketplace:"shopee"},actions:{channel_ids:["ch0"]}},
 {enabled:true,conditions:{marketplace:"shopee",mavuriCategories:["beleza"]},actions:{channel_ids:["ch1"]}},
 {enabled:true,conditions:{marketplace:"shopee",mavuriCategories:["cozinha"]},actions:{channel_ids:["ch2"]}},
 {enabled:true,conditions:{marketplace:"shopee",mavuriCategories:["eletronicos"]},actions:{channel_ids:["ch3"]}}
];
const cats=["beleza","cozinha","eletronicos"].map(x=>({id:x,slug:x,active:true}));
const input=(id,category,title)=>{
 const link="https://s.shopee.com.br/"+id;
 return {c:{id,price:29.99,discount:24,url:link},
 row:{id:"offer"+id,source_ref:id,user_id:"u",marketplace_id:"m",
 affiliate_account_id:"a",price:29.99,affiliate_url:link,
 title,image_url:"https://img.shopee.com.br/img.jpg",mavuri_category_id:category,
 mavuri_tags:[category],metadata:{mavuri:{category_slug:category}}}};
};
const fixtures=[
 input("1","beleza","Batons e maquiagem para mulher"),
 input("2","cozinha","Panela inox 2 litros"),
 input("3","eletronicos","Monitor LCD 24 polegadas"),
 input("4","cozinha","Garrafa térmica"),
 input("5","cozinha","Conjunto de facas")
];
const base={candidates:fixtures.map(x=>x.c),stored:fixtures.map(x=>x.row),
 categories:cats,channels,rules,history:[],pending:[],
 owner:"u",marketplace:"m",account:"a",now,maxUnique:8};
let plan=planFourChannelCycle(base);
check(plan.ready===true,"ready");check(plan.counts.selected===4,"2/cat cap");
check(plan.counts.jobs===8,"general+niche fanout explicit");
check(plan.jobs.filter(x=>x.channel_id==="ch0").length===4,"four general");
check(plan.jobs.filter(x=>x.channel_id==="ch2").length===2,"home two");
check(plan.jobs.filter(x=>x.channel_id==="ch1").length===1,"women one");
check(plan.jobs.filter(x=>x.channel_id==="ch3").length===1,"tech one");
check(!planFourChannelCycle({...base,channels:channels.slice(1)}).ready,"four connected required");
plan=planFourChannelCycle({...base,history:[{
 offer_id:"offer1",channel_id:"ch0",status:"sent",
 sent_at:new Date(now-2*3600000).toISOString()
}]});
check(plan.jobs.filter(x=>x.offer_id==="offer1").length===1,"niche only after general cooldown");
plan=planFourChannelCycle({...base,pending:[{offer_id:"offer3",channel_id:"ch3",status:"queued"}]});
check(plan.jobs.some(x=>x.offer_id==="offer3"&&x.channel_id==="ch0"),"general still allowed");
check(!plan.jobs.some(x=>x.offer_id==="offer3"&&x.channel_id==="ch3"),"no pending niche duplicate");
const stale=fixtures.map(x=>structuredClone(x.row));stale[0].price=21;
plan=planFourChannelCycle({...base,stored:stale});
check(!plan.selected.some(x=>x.ref==="1"),"price mismatch fails closed");
const staleLink=fixtures.map(x=>structuredClone(x.row));staleLink[0].affiliate_url="https://s.shopee.com.br/changed";
plan=planFourChannelCycle({...base,stored:staleLink});
check(!plan.selected.some(x=>x.ref==="1"),"affiliate mismatch fails closed");
plan=planFourChannelCycle({...base,maxUnique:1});
check(plan.counts.selected===1,"cap one");
console.log("Four-channel Shopee cycle: 10 offline safety checks passed.");

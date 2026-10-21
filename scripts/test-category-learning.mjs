import assert from 'node:assert/strict'
import { reviseCategoryDecision, renderCategoryDecisionControls, renderCategoryHistoryList } from '../src/application/category-decisions.js'
import { canRestorePendingCategoryDecision, normalizeCategoryReviewDraft } from '../src/application/category-review-draft.js'
import { loadCategoryLearningCandidates, renderCategoryLearningCandidates } from '../src/application/category-learning.js'

const calls=[]
const api={rpc:async(name,args)=>{
 calls.push({name,args})
 if(name==='mavuri_dashboard_category_revise_v1'){
  return {data:{ok:true,action:'revise',action_id:42,category_before:'cozinha',category_after:'saude-bem-estar'},error:null}
 }
 if(name==='mavuri_dashboard_learning_candidates_v1'){
  return {data:{total:1,automatic_rules_applied:false,items:[
   {marketplace:'mercadolivre',source_category_id:'MLB3385',source_category_name:'Módulos Amplificadores',
    reviewed_examples:3,destinations:1,confidence_label:'candidato_forte',suggested_category:'automotivo',
    examples:[{title:'<img src=x onerror=alert(1)> Módulo Taramps',category:'automotivo'}]}
  ]},error:null}
 }
 return {data:null,error:{message:'unexpected RPC'}}
}}
const a=await reviseCategoryDecision(api,{
 offerId:'test-offer',targetSlug:'saude-bem-estar',updatedAt:'2026-10-20T21:00:00Z',expectedActionId:16,note:'  luva multiuso  '
})
assert.equal(a.action_id,42)
assert.deepEqual(calls[0],{
 name:'mavuri_dashboard_category_revise_v1',
 args:{p_offer_id:'test-offer',p_category_slug:'saude-bem-estar',p_expected_updated_at:'2026-10-20T21:00:00Z',p_expected_action_id:16,p_note:'luva multiuso'}
})
await assert.rejects(()=>reviseCategoryDecision(api,{offerId:'test',targetSlug:'outros',updatedAt:'x',expectedActionId:1}),/incompletos/)
await assert.rejects(()=>reviseCategoryDecision(api,{offerId:'test',targetSlug:'beleza',updatedAt:'x',expectedActionId:0}),/incompletos/)
const escapeHtml=(s)=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
const item={offer_id:'validid',title:'Luva',category_slug:'cozinha',manual_decision:'approve',needs_review:false,last_action_id:16,last_action_kind:'approve',audit_updated_at:'2026-10-20T21:00:00Z'}
const categories=[{slug:'cozinha',name:'Cozinha'},{slug:'saude-bem-estar',name:'Saúde e Bem-estar'}]
const html=renderCategoryDecisionControls(item,categories,escapeHtml)
assert.match(html,/data-cat-revise="validid"/)
assert.match(html,/Alterar categoria/)
assert.match(html,/Desfazer última decisão/)
assert.doesNotMatch(html,/data-cat-correct=/)
assert.doesNotMatch(html,/data-cat-approve=/)
const second=renderCategoryDecisionControls({...item,last_action_kind:'revise'},categories,escapeHtml)
assert.match(second,/data-cat-undo="16"/)
const history=renderCategoryHistoryList({items:[{action:'revise',category_before:'cozinha',category_after:'saude-bem-estar',note:'<script>',created_at:'2026-10-20T21:00:00Z'}]},escapeHtml,x=>x)
assert.match(history,/Categoria alterada novamente/)
assert.match(history,/cozinha → saude-bem-estar/)
assert.doesNotMatch(history,/<script>/)
const pending=normalizeCategoryReviewDraft({version:1,pending:{
 offerId:'11111111-1111-4111-8111-111111111111',action:'revise',targetSlug:'saude-bem-estar',
 actionId:16,updatedAt:'2026-10-20T21:00:00Z',note:'Maybe'
}}).pending
assert.ok(pending)
const snapshot={...item,offer_id:pending.offerId}
assert.equal(canRestorePendingCategoryDecision(pending,snapshot,categories),true)
assert.equal(canRestorePendingCategoryDecision(pending,{...snapshot,last_action_id:17},categories),false)
assert.equal(canRestorePendingCategoryDecision(pending,{...snapshot,audit_updated_at:'stale'},categories),false)
const proposals=await loadCategoryLearningCandidates(api)
assert.equal(proposals.total,1)
assert.equal(calls[1].name,'mavuri_dashboard_learning_candidates_v1')
const learningHtml=renderCategoryLearningCandidates({data:proposals},escapeHtml)
assert.match(learningHtml,/MLB3385/)
assert.match(learningHtml,/Automotivo|automotivo/)
assert.match(learningHtml,/Nenhuma regra foi aplicada automaticamente/)
assert.doesNotMatch(learningHtml,/<img src=x onerror=alert/)
await assert.rejects(()=>loadCategoryLearningCandidates({rpc:async()=>({data:{items:[],automatic_rules_applied:true},error:null})}),/inesperados/)
console.log('Mavuri revised category + supervised learning QA: OK')

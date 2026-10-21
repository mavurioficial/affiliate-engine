// Solicitações públicas de ofertas, consultadas somente pelo painel autenticado.
// Não é um gatilho para Discovery nem para publicação automática.
const LABELS = {
  marketplace:{qualquer:'Qualquer loja',mercadolivre:'Mercado Livre',shopee:'Shopee',amazon:'Amazon',magalu:'Magalu'},
  category:{tecnologia:'Tecnologia','casa-cozinha':'Casa & Cozinha','moda-beleza':'Moda & Beleza',infantil:'Infantil',automotivo:'Automotivo',ferramentas:'Ferramentas',esporte:'Esporte','saude-bem-estar':'Saúde e bem-estar',pet:'Pet',outros:'Outros'},
  purchase_window:{agora:'Assim que aparecer uma boa oferta','7_dias':'Até 7 dias','30_dias':'Até 30 dias',sem_pressa:'Sem pressa'},
  status:{new:'Novo',reviewing:'Em busca',prioritized:'Prioritário',archived:'Arquivado'}
}
export async function loadOfferRequests(supabase){
  const {data,error}=await supabase.rpc('mavuri_dashboard_offer_requests_v1',{p_limit:100})
  if(error)throw error
  if(!data||!Array.isArray(data.items))throw new Error('Resposta inesperada ao consultar pedidos.')
  return data
}
export async function changeOfferRequestStatus(supabase,id,status){
  const {data,error}=await supabase.rpc('mavuri_dashboard_offer_request_status_v1',{p_id:id,p_status:status})
  if(error)throw error
  if(data?.id!==id||data?.status!==status)throw new Error('A alteração não foi confirmada.')
  return data
}
export function renderOfferRequests(state,escapeHtml,formatMoney,formatDateTime){
  const safe=(x)=>escapeHtml(String(x??''))
  const data=state.data
  const all=Array.isArray(data?.items)?data.items:[]
  const filter=state.filter||'active'
  const rows=all.filter((x)=>filter==='all'||(filter==='active'?x.status!=='archived':x.status===filter))
  const statuses=Object.entries(LABELS.status).map(([value,label])=>'<option value="'+value+'">'+label+'</option>')
  const card=(x)=>{
    const status=LABELS.status[x.status]||x.status
    const info=[
      LABELS.marketplace[x.marketplace]||x.marketplace,
      LABELS.category[x.category]||x.category,
      LABELS.purchase_window[x.purchase_window]||x.purchase_window
    ].map(safe).join(' · ')
    const controls=statuses.map((o)=>o.replace('value="'+x.status+'"','value="'+x.status+'" selected'))
    const price=x.target_price!=null?' · Meta: <strong>'+safe(formatMoney(x.target_price))+'</strong>':''
    return '<article class="request-item">'+
      '<div class="request-item-top"><strong>'+safe(x.product_name)+'</strong><span class="request-state">'+safe(status)+'</span></div>'+
      '<div class="request-meta">'+info+price+'</div>'+
      (x.notes?'<p class="request-note">Detalhes: '+safe(x.notes)+'</p>':'')+
      '<div class="request-actions"><span>Pedido em '+safe(formatDateTime(x.created_at))+'</span>'+
      '<label>Andamento <select data-request-status="'+safe(x.id)+'" aria-label="Andamento do pedido '+safe(x.product_name)+'">'+controls.join('')+'</select></label></div>'+
      '</article>'
  }
  const chips=[['active','Pendentes'],['new','Novos'],['reviewing','Em busca'],['prioritized','Prioritários'],['archived','Arquivados'],['all','Todos']]
    .map(([key,label])=>'<button type="button" data-request-filter="'+key+'" class="'+(filter===key?'active':'')+'">'+label+'</button>').join('')
  return '<section class="dashboard-panel request-panel" id="mavuri-offer-requests" aria-label="Pedidos de ofertas do público">'+
    '<div class="request-heading"><div><p class="eyebrow">INTERESSE DE COMPRA</p><h2>Pedidos de ofertas</h2>'+
    '<p>Solicitações do formulário público. Pesquise manualmente os produtos e marque o andamento; não há publicação automática a partir desta lista.</p></div>'+
    '<div class="request-counts"><strong>'+(data?Number(data.total||0).toLocaleString('pt-BR'):'—')+'</strong><span>pedidos recebidos</span></div></div>'+
    (state.notice?'<div class="request-notice" role="status">'+safe(state.notice)+'</div>':'')+
    (state.error?'<div class="notice" role="alert">'+safe(state.error)+'</div>':'')+
    '<div class="request-toolbar"><div class="request-filters" role="group" aria-label="Filtrar pedidos">'+chips+'</div>'+
    '<button type="button" data-request-refresh>↻ Atualizar pedidos</button></div>'+
    (state.loading&&!data?'<p class="request-empty">Carregando pedidos...</p>':
      rows.length?'<div class="request-list">'+rows.map(card).join('')+'</div>':
      '<p class="request-empty">'+(data?'Nenhum pedido neste filtro.':'Aguardando consulta dos pedidos...')+'</p>')+
    '<p class="request-footnote">O status organiza seu trabalho manual e não altera o Discovery. Não exibir dados técnicos de identificação de visitantes.</p>'+
    '</section>'
}

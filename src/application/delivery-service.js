import { supabase } from '../app/auth.js'
import { findMatchingRules } from './rule-service.js'
import { normalizeOffer } from '../domain/offer-engine.js'

export async function enqueueOfferDeliveries(offer) {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) throw new Error('Usuário não autenticado.')

  const rules = await findMatchingRules(normalizeOffer(offer))
  const channelIds = [...new Set(rules.flatMap(rule => Array.isArray(rule.actions?.channel_ids) ? rule.actions.channel_ids : []))]
  if (!channelIds.length) return []

  const jobs = channelIds.map(channelId => ({
    user_id:user.id, offer_id:offer.id, channel_id:channelId,
    status:'queued', attempts:0, scheduled_for:new Date().toISOString(), delivery_key:`${offer.id}:${channelId}`
  }))
  const { data, error } = await supabase.from('flow_delivery_jobs').upsert(jobs, { onConflict: 'user_id,delivery_key', ignoreDuplicates: true }).select()
  if (error) throw error
  return data || []
}

export async function listDeliveryJobs({ status } = {}) {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) throw new Error('Usuário não autenticado.')
  let query = supabase.from('flow_delivery_jobs').select('*').eq('user_id', user.id).order('created_at',{ascending:false}).limit(100)
  if (status) query=query.eq('status',status)
  const { data,error }=await query
  if(error) throw error
  return data || []
}


export async function retryFailedDeliveries() {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) throw new Error('Usuário não autenticado.')
  const { data, error } = await supabase.from('flow_delivery_jobs')
    .update({ status: 'queued', error_message: null, scheduled_for: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('status', 'failed')
    .lt('attempts', 5)
    .select()
  if (error) throw error
  return data || []
}

/**
 * Publicação solicitada explicitamente pelo operador. Não consulta regras
 * automáticas de desconto, categoria ou diversidade. A fila permanece
 * responsável pelo envio físico aos destinos escolhidos.
 */
export async function enqueueManualOfferDeliveries(offer, selectedChannelIds) {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) throw new Error('Faça login novamente no Mavuri.')
  if (!offer?.id || !offer?.affiliate_url || !/^https:\/\//i.test(offer.affiliate_url)) {
    throw new Error('A oferta precisa estar salva e ter um link de afiliado HTTPS válido.')
  }
  const ids = [...new Set((selectedChannelIds || []).filter(Boolean))]
  if (!ids.length) throw new Error('Selecione pelo menos um destino.')
  const { data: channels, error: channelError } = await supabase.from('flow_channels')
    .select('id,name,type,status').eq('user_id',user.id).in('id',ids)
  if (channelError) throw channelError
  if (!channels || channels.length !== ids.length || channels.some(c => c.status !== 'connected')) {
    throw new Error('Um dos destinos não está conectado ou não pertence ao Mavuri.')
  }
  const { data: rows, error } = await supabase.from('flow_delivery_jobs').upsert(
    ids.map(channelId => ({
      user_id: user.id, offer_id: offer.id, channel_id: channelId,
      status: 'queued', attempts: 0, scheduled_for: new Date().toISOString(),
      delivery_key: `${offer.id}:${channelId}`
    })),
    { onConflict: 'user_id,delivery_key', ignoreDuplicates: true }
  ).select('id,channel_id,status')
  if (error) throw error
  return { queued: rows || [], skipped: ids.length - (rows || []).length, channels }
}

import { supabase } from '../app/auth.js'
import { matchesRule } from '../domain/offer-engine.js'

export async function listRules() {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) throw new Error('Usuário não autenticado.')
  const { data, error } = await supabase.from('flow_rules').select('*').eq('user_id', user.id).order('priority').order('created_at')
  if (error) throw error
  return data || []
}

export async function findMatchingRules(offer) {
  const rules = await listRules()
  return rules.filter(rule => rule.enabled && matchesRule(offer, rule.conditions || {}))
}

export async function createRule(input) {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) throw new Error('Usuário não autenticado.')
  const { data, error } = await supabase.from('flow_rules').insert({
    user_id:user.id,name:String(input.name || 'Nova regra'),enabled:input.enabled !== false,
    priority:Number(input.priority ?? 100),conditions:input.conditions || {},actions:input.actions || {}
  }).select().single()
  if (error) throw error
  return data
}

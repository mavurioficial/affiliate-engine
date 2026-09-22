import { supabase } from '../app/auth.js'

export async function listChannels({ type } = {}) {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) throw new Error('Usuário não autenticado.')
  let query = supabase.from('flow_channels').select('*').eq('user_id', user.id).order('created_at')
  if (type) query = query.eq('type', type)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function createChannel(input) {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) throw new Error('Usuário não autenticado.')
  const { data, error } = await supabase.from('flow_channels').insert({
    user_id: user.id,
    type: String(input.type || 'telegram'),
    name: String(input.name || 'Novo canal'),
    external_ref: String(input.externalRef || ''),
    status: 'pending',
    settings: { bot_env: 'TELEGRAM_BOT_TOKEN' }
  }).select().single()
  if (error) throw error
  return data
}

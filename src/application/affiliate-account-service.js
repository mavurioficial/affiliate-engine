import { supabase } from '../app/auth.js'

async function resolveMarketplaceId(slug) {
  const { data, error } = await supabase
    .from('flow_marketplaces')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  return data?.id || null
}

export async function listAffiliateAccounts(marketplace = null) {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) throw new Error('Usuário não autenticado.')

  let query = supabase
    .from('flow_affiliate_accounts')
    .select('id,name,status,external_account_id,settings,marketplace_id,created_at,updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (marketplace) {
    const marketplaceId = await resolveMarketplaceId(marketplace)
    if (marketplaceId) query = query.eq('marketplace_id', marketplaceId)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function getActiveAffiliateAccount(marketplace) {
  const accounts = await listAffiliateAccounts(marketplace)
  return accounts.find(account => account.status === 'active') || null
}

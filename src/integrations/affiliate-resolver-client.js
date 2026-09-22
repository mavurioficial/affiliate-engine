const DEFAULT_RESOLVER = 'https://otikoxnfotyjgphrdudn.supabase.co/functions/v1/affiliate-resolver'

export async function resolveMercadoLivreAffiliateUrl(affiliateUrl, { accessToken, endpoint = DEFAULT_RESOLVER } = {}) {
  if (!accessToken) throw new Error('Sessão do Mavuri ausente.')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ affiliate_url: affiliateUrl }),
    cache: 'no-store'
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload?.error || 'Não foi possível resolver o link de afiliado.')
    error.status = response.status
    error.data = payload
    throw error
  }
  return payload
}

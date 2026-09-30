const DEFAULT_SUPABASE_URL = 'https://otikoxnfotyjgphrdudn.supabase.co'
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_DSklSKpNz_Jlwi2Wx089TA_5JR8pBSt'

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim()
}

async function callQueue(payload) {
  const accessToken = env('MAVURI_SUPABASE_ACCESS_TOKEN')
  if (!accessToken) throw new Error('MAVURI_SUPABASE_ACCESS_TOKEN não configurado.')

  const supabaseUrl = env('MAVURI_SUPABASE_URL', DEFAULT_SUPABASE_URL).replace(/\/$/, '')
  const publishableKey = env('MAVURI_SUPABASE_PUBLISHABLE_KEY', DEFAULT_PUBLISHABLE_KEY)

  const response = await fetch(`${supabaseUrl}/functions/v1/affiliate-link-queue`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      apikey: publishableKey,
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`affiliate-link-queue HTTP ${response.status}: ${data?.error || JSON.stringify(data)}`)
  }
  return data
}

export async function claimAffiliateLinkRequests({ marketplace = 'mercadolivre', limit = 5 } = {}) {
  const result = await callQueue({ action: 'claim', marketplace, limit })
  return Array.isArray(result.claimed) ? result.claimed : []
}

export async function completeAffiliateLinkRequest(requestId, affiliateUrl) {
  return callQueue({ action: 'complete', request_id: requestId, affiliate_url: affiliateUrl })
}

export async function failAffiliateLinkRequest(requestId, error, { retry = true } = {}) {
  return callQueue({
    action: 'fail',
    request_id: requestId,
    retry,
    error_message: error instanceof Error ? error.message : String(error || 'Falha ao gerar link afiliado.'),
  })
}

async function cli() {
  const action = String(process.argv[2] || 'claim').toLowerCase()

  if (action === 'claim') {
    const marketplace = process.argv[3] || 'mercadolivre'
    const limit = Number(process.argv[4] || 5)
    const claimed = await claimAffiliateLinkRequests({ marketplace, limit })
    console.log(JSON.stringify({ claimed }, null, 2))
    return
  }

  if (action === 'complete') {
    const requestId = process.argv[3]
    const affiliateUrl = process.argv[4]
    if (!requestId || !affiliateUrl) throw new Error('Uso: complete <request_id> <affiliate_url>')
    console.log(JSON.stringify(await completeAffiliateLinkRequest(requestId, affiliateUrl), null, 2))
    return
  }

  if (action === 'fail') {
    const requestId = process.argv[3]
    const message = process.argv.slice(4).join(' ') || 'Falha ao gerar link afiliado.'
    if (!requestId) throw new Error('Uso: fail <request_id> [mensagem]')
    console.log(JSON.stringify(await failAffiliateLinkRequest(requestId, message), null, 2))
    return
  }

  throw new Error(`Ação inválida: ${action}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  cli().catch((error) => {
    console.error(error.message || error)
    process.exitCode = 1
  })
}

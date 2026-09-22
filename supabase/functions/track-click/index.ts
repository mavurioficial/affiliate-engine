import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}")
const secretKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const trackingId = url.searchParams.get("t")?.trim()
  if (!trackingId) return new Response("Tracking ID ausente.", { status: 400 })

  const admin = createClient(supabaseUrl, secretKey)
  const { data: click, error } = await admin
    .from("flow_clicks")
    .select("id,click_count,offer:flow_offers(affiliate_url,product_url)")
    .eq("tracking_id", trackingId)
    .maybeSingle()

  if (error || !click) return new Response("Link não encontrado.", { status: 404 })

  const destination = String(click.offer?.affiliate_url || click.offer?.product_url || "")
  let destinationUrl: URL
  try {
    destinationUrl = new URL(destination)
  } catch {
    return new Response("Destino inválido.", { status: 410 })
  }

  if (!["http:", "https:"].includes(destinationUrl.protocol)) {
    return new Response("Destino inválido.", { status: 410 })
  }

  await admin
    .from("flow_clicks")
    .update({ click_count: Number(click.click_count || 0) + 1, last_clicked_at: new Date().toISOString() })
    .eq("id", click.id)

  return new Response(null, {
    status: 302,
    headers: { Location: destinationUrl.toString(), "Cache-Control": "no-store" }
  })
})

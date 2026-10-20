-- Mavuri dashboard V1 — consulta somente leitura, filtro obrigatório por auth.uid().
CREATE OR REPLACE FUNCTION public.mavuri_dashboard_operations_v1(p_days integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_start timestamptz;
  v_end timestamptz := now();
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;
  IF p_days NOT IN (1, 7, 30) THEN
    RAISE EXCEPTION 'Period must be 1, 7 or 30 days' USING ERRCODE = '22023';
  END IF;
  v_start := (((v_end AT TIME ZONE 'America/Sao_Paulo')::date - (p_days - 1))::timestamp AT TIME ZONE 'America/Sao_Paulo');

  WITH
  deliveries AS (
    SELECT j.channel_id, 'oferta'::text AS kind, j.status, j.sent_at, j.created_at, j.error_message,
           j.offer_id::text AS ref
      FROM public.flow_delivery_jobs j
      WHERE j.user_id = v_user
        AND (j.sent_at >= v_start OR j.created_at >= v_start)
    UNION ALL
    SELECT j.channel_id, 'cupom'::text AS kind, j.status, j.sent_at, j.created_at, j.error_message,
           j.coupon_id::text AS ref
      FROM public.flow_coupon_delivery_jobs j
      WHERE j.user_id = v_user
        AND (j.sent_at >= v_start OR j.created_at >= v_start)
    UNION ALL
    SELECT j.channel_id, 'cupom_whatsapp'::text AS kind, j.status, j.sent_at, j.created_at, j.error_message,
           (j.bundle_key || ':' || j.part_index::text) AS ref
      FROM public.flow_whapi_coupon_jobs j
      WHERE j.user_id = v_user
        AND (j.sent_at >= v_start OR j.created_at >= v_start)
  ),
  channel_stats AS (
    SELECT c.id,c.name,c.type,c.status,
       COUNT(d.ref) FILTER (WHERE d.status='sent' AND d.sent_at >= v_start) AS sent,
       COUNT(d.ref) FILTER (WHERE d.kind='oferta' AND d.status='sent' AND d.sent_at >= v_start) AS sent_offers,
       COUNT(d.ref) FILTER (WHERE d.kind<>'oferta' AND d.status='sent' AND d.sent_at >= v_start) AS sent_coupons,
       COUNT(d.ref) FILTER (WHERE d.status='failed' AND d.created_at >= v_start) AS failed,
       COUNT(d.ref) FILTER (WHERE d.status IN ('queued','processing') AND d.created_at >= v_start) AS pending
    FROM public.flow_channels c
    LEFT JOIN deliveries d ON d.channel_id = c.id
    WHERE c.user_id = v_user
    GROUP BY c.id,c.name,c.type,c.status
  ),
  marketplace_stats AS (
    SELECT mp.slug,mp.name,
       count(DISTINCT j.offer_id) FILTER (WHERE j.status='sent' AND j.sent_at >= v_start) AS offers_published
      FROM public.flow_marketplaces mp
      LEFT JOIN public.flow_offers o ON o.marketplace_id=mp.id AND o.user_id=v_user
      LEFT JOIN public.flow_delivery_jobs j ON j.offer_id=o.id AND j.user_id=v_user AND j.status='sent' AND j.sent_at >= v_start
     WHERE mp.active=true
     GROUP BY mp.id,mp.slug,mp.name
  ),
  category_stats AS (
    SELECT count(*) AS audited,
      count(*) FILTER (WHERE a.needs_review) AS needs_review,
      count(*) FILTER (WHERE a.mavuri_category_slug='outros') AS other,
      count(*) FILTER (WHERE a.classification_source LIKE '%fallback%') AS fallback
    FROM public.flow_offers o
    JOIN public.mavuri_category_audit a ON a.offer_id=o.id AND a.user_id=v_user
    WHERE o.user_id=v_user AND o.created_at>=v_start AND o.created_at<=v_end
  ),
  latest_errors AS (
    SELECT d.kind,d.error_message,d.created_at,c.name AS channel_name
    FROM deliveries d
    JOIN public.flow_channels c ON c.id=d.channel_id AND c.user_id=v_user
    WHERE d.status='failed' AND d.created_at>=v_start
      AND d.error_message IS NOT NULL
    ORDER BY d.created_at DESC
    LIMIT 8
  )
  SELECT jsonb_build_object(
     'generated_at',v_end,
     'timezone','America/Sao_Paulo',
     'days',p_days,
     'period_start',v_start,
     'offers_created',(SELECT count(*) FROM public.flow_offers o WHERE o.user_id=v_user AND o.created_at BETWEEN v_start AND v_end),
     'unique_offers_published',(SELECT count(DISTINCT j.offer_id) FROM public.flow_delivery_jobs j WHERE j.user_id=v_user AND j.status='sent' AND j.sent_at BETWEEN v_start AND v_end),
     'messages_sent',(SELECT count(*) FROM deliveries d WHERE d.status='sent' AND d.sent_at BETWEEN v_start AND v_end),
     'coupon_messages_sent',(SELECT count(*) FROM deliveries d WHERE d.kind <> 'oferta' AND d.status='sent' AND d.sent_at BETWEEN v_start AND v_end),
     'errors',(SELECT count(*) FROM deliveries d WHERE d.status='failed' AND d.created_at BETWEEN v_start AND v_end),
     'pending',(SELECT count(*) FROM deliveries d WHERE d.status IN ('queued','processing') AND d.created_at BETWEEN v_start AND v_end),
     'channels',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'name',name,'type',type,'status',status,
        'sent',sent,'offers',sent_offers,'coupons',sent_coupons,
        'failed',failed,'pending',pending
      ) ORDER BY type,name) FROM channel_stats),'[]'::jsonb),
     'marketplaces',COALESCE((SELECT jsonb_agg(jsonb_build_object('slug',slug,'name',name,'offers_published',offers_published) ORDER BY slug) FROM marketplace_stats),'[]'::jsonb),
     'categories',(SELECT jsonb_build_object('audited',audited,'needs_review',needs_review,'other',other,'fallback',fallback) FROM category_stats),
     'whapi',(SELECT coalesce(jsonb_agg(jsonb_build_object(
        'status',c.status,
        'paused',coalesce((c.settings #>> '{whapi_pause,active}')::boolean,false),
        'pause_reason',c.settings #>> '{whapi_pause,reason}',
        'next_check',c.settings #>> '{whapi_pause,next_check_at}'
      )),'[]'::jsonb) FROM public.flow_channels c WHERE c.user_id=v_user AND c.type='whatsapp'),
     'latest_errors',COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'kind',kind,'channel',channel_name,
         'error',left(error_message,250),'created_at',created_at
     ) ORDER BY created_at DESC) FROM latest_errors),'[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

REVOKE ALL ON FUNCTION public.mavuri_dashboard_operations_v1(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mavuri_dashboard_operations_v1(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.mavuri_dashboard_operations_v1(integer) TO authenticated;

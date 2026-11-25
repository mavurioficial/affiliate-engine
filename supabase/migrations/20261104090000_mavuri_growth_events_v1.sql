-- Mavuri Growth Engine V1: telemetria agregável, sem PII, IP, cookies ou identificadores.
-- Revisar/aplicar somente após aprovação do PR; não há deploy automático nesta branch.
CREATE TABLE IF NOT EXISTS public.mavuri_growth_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type text NOT NULL CHECK (event_type IN ('page_view', 'join_click', 'share_click')),
  source text NOT NULL CHECK (source IN (
    'direto', 'instagram', 'facebook', 'whatsapp', 'telegram',
    'seo', 'parceiro', 'compartilhamento', 'outros'
  )),
  campaign text NOT NULL DEFAULT '' CHECK (campaign ~ '^[a-z0-9_-]{0,48}$'),
  content text NOT NULL DEFAULT '' CHECK (content ~ '^[a-z0-9_-]{0,48}$'),
  channel text NOT NULL CHECK (channel IN ('site', 'whatsapp', 'telegram')),
  page text NOT NULL DEFAULT 'entrar' CHECK (page = 'entrar'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mavuri_growth_event_channel_consistency CHECK (
    (event_type = 'join_click' AND channel IN ('whatsapp', 'telegram'))
    OR (event_type <> 'join_click' AND channel = 'site')
  )
);

CREATE INDEX IF NOT EXISTS mavuri_growth_events_created_source_idx
  ON public.mavuri_growth_events (created_at DESC, source, event_type);

ALTER TABLE public.mavuri_growth_events ENABLE ROW LEVEL SECURITY;

-- A função Edge grava via service role. Nenhum acesso anônimo ou autenticado à tabela.
REVOKE ALL ON TABLE public.mavuri_growth_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.mavuri_growth_events_id_seq FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.mavuri_growth_events IS
  'Eventos de funil da landing page, sem dados pessoais. Retenção e controles antiabuso exigem revisão operacional.';

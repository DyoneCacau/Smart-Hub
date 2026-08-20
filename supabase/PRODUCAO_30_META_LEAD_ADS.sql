-- ============================================================
-- PRODUÇÃO 30 — META LEAD ADS (CAPTURA → CRM)
-- ============================================================
-- INSTRUÇÕES:
-- 1. Execute antes: PRODUCAO_25 … PRODUCAO_29.
-- 2. Revise este arquivo antes de executar.
-- 3. No Supabase: SQL Editor > New query > cole TODO o conteúdo > Run.
-- 4. Confirme as consultas de verificação no final.
--
-- Este script NÃO sobe com o deploy da Vercel.
--
-- O que faz:
-- - Coluna `page_access_token` em `integration_credentials` (service_role only)
--   para assinar leadgen e buscar GET /{leadgen_id}.
-- - Índice auxiliar para resolver integração Meta pelo page_id público
--   em `integrations.config->meta->>page_id` (sem ler tokens).
--
-- NÃO altera WhatsApp, mensageria nem campanhas.
-- ============================================================

BEGIN;

ALTER TABLE public.integration_credentials
  ADD COLUMN IF NOT EXISTS page_access_token text;

COMMENT ON COLUMN public.integration_credentials.page_access_token IS
  'Page Access Token da Página selecionada. Somente Edge Functions (service_role). Nunca expor ao browser.';

-- Resolução multi-tenant do webhook Lead Ads: page_id → integração
CREATE INDEX IF NOT EXISTS idx_integrations_meta_page_id
  ON public.integrations ((config->'meta'->>'page_id'))
  WHERE provider = 'meta'
    AND (config->'meta'->>'page_id') IS NOT NULL;

COMMIT;

-- ============================================================
-- VERIFICAÇÃO
-- ============================================================
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'integration_credentials'
--   AND column_name = 'page_access_token';
--
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'integrations' AND indexname = 'idx_integrations_meta_page_id';

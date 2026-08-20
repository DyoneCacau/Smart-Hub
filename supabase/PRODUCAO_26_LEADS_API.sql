-- ============================================================
-- PRODUÇÃO 26 — API UNIVERSAL DE LEADS (ORIGEM + IDEMPOTÊNCIA)
-- ============================================================
-- INSTRUÇÕES:
-- 1. Execute PRIMEIRO o PRODUCAO_25_INTEGRACOES.sql (cria public.integrations).
-- 2. Revise este arquivo antes de executar.
-- 3. No Supabase, abra SQL Editor > New query.
-- 4. Cole TODO o conteúdo deste arquivo e clique em Run.
-- 5. Confirme ao final que a consulta de verificação não retorna erro.
--
-- Este script NÃO é executado automaticamente pelo deploy da Vercel.
--
-- O que faz:
-- - Liga cada lead do CRM à integração que o trouxe (integration_id)
-- - Guarda o id do lead no provedor (external_lead_id) e o payload original
-- - Garante idempotência: o mesmo lead do provedor não entra duas vezes
-- - Cria índices para deduplicar por telefone e e-mail dentro da clínica
--
-- Isolamento: as colunas entram em crm_leads, que já é isolada por
-- clinic_id com RLS (PRODUCAO_14). Nenhuma policy é alterada aqui.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Origem do lead: qual integração trouxe e qual o id de lá
-- ------------------------------------------------------------
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_lead_id text,
  ADD COLUMN IF NOT EXISTS source_payload jsonb;

COMMENT ON COLUMN public.crm_leads.integration_id IS
  'Integração que criou o lead (NULL = criado manualmente no Kanban)';
COMMENT ON COLUMN public.crm_leads.external_lead_id IS
  'Id do lead no provedor (leadgen_id do Meta, submission id do formulário, etc.)';
COMMENT ON COLUMN public.crm_leads.source_payload IS
  'Payload recebido da integração, para auditoria e reprocessamento';

-- ------------------------------------------------------------
-- 2. Idempotência: mesmo lead do mesmo provedor não duplica
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_leads_external_lead
  ON public.crm_leads (clinic_id, integration_id, external_lead_id)
  WHERE external_lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_integration
  ON public.crm_leads (clinic_id, integration_id);

-- ------------------------------------------------------------
-- 3. Deduplicação por contato dentro da clínica
-- ------------------------------------------------------------
-- Colunas geradas: comparam o contato independente de como foi digitado.
-- O telefone usa os 10 últimos dígitos, então "(11) 98888-7777",
-- "11988887777" e "+55 11 98888-7777" são reconhecidos como o mesmo número.
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS phone_dedupe_key text
  GENERATED ALWAYS AS (
    NULLIF(RIGHT(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10), '')
  ) STORED;

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS email_dedupe_key text
  GENERATED ALWAYS AS (NULLIF(lower(btrim(COALESCE(email, ''))), '')) STORED;

COMMENT ON COLUMN public.crm_leads.phone_dedupe_key IS
  'Últimos 10 dígitos do telefone; usado para não duplicar lead da mesma pessoa';
COMMENT ON COLUMN public.crm_leads.email_dedupe_key IS
  'E-mail normalizado; usado para não duplicar lead da mesma pessoa';

-- Índices parciais: leads sem telefone/e-mail não ocupam espaço no índice.
CREATE INDEX IF NOT EXISTS idx_crm_leads_clinic_phone_key
  ON public.crm_leads (clinic_id, phone_dedupe_key)
  WHERE phone_dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_clinic_email_key
  ON public.crm_leads (clinic_id, email_dedupe_key)
  WHERE email_dedupe_key IS NOT NULL;

-- ------------------------------------------------------------
-- 4. Leads criados por integração não têm usuário responsável
-- ------------------------------------------------------------
-- owner_user_id e created_by já são nulos por padrão em PRODUCAO_14;
-- o bloco abaixo só remove um NOT NULL caso tenha sido adicionado depois.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crm_leads'
      AND column_name = 'owner_user_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.crm_leads ALTER COLUMN owner_user_id DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crm_leads'
      AND column_name = 'created_by'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.crm_leads ALTER COLUMN created_by DROP NOT NULL;
  END IF;
END $$;

COMMIT;

-- VERIFICAÇÃO (somente leitura):
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'crm_leads'
  AND column_name IN (
    'integration_id', 'external_lead_id', 'source_payload',
    'phone_dedupe_key', 'email_dedupe_key'
  )
ORDER BY column_name;

-- Índice de idempotência criado (deve retornar 1 linha):
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'crm_leads'
  AND indexname = 'uq_crm_leads_external_lead';

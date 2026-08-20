-- ============================================================
-- PRODUÇÃO 34 — SYNC DO SCHEMA crm_leads (API DE LEADS / SMART HUB)
-- ============================================================
-- INSTRUÇÕES:
-- 1. Revise este arquivo antes de executar.
-- 2. No Supabase: SQL Editor > New query.
-- 3. Cole TODO o conteúdo deste arquivo e clique em Run.
-- 4. Confirme as consultas de verificação ao final.
--
-- Este script NÃO é executado automaticamente pelo deploy da Vercel.
--
-- Por que existe:
-- O ingestLead (Edge) envia no INSERT as colunas integration_id,
-- external_lead_id e source_payload. Em produção o PostgREST retornou
-- PGRST204 ("Could not find the 'external_lead_id' column"), indicando
-- que PRODUCAO_26 não foi aplicado (ou o schema cache ficou desatualizado).
-- PRODUCAO_32 lista PRODUCAO_26 como pré-requisito, mas o CRM/Smart Hub
-- pode ter sido aplicado sem o script 26.
--
-- O que faz (idempotente):
-- - ADD COLUMN IF NOT EXISTS para origin/idempotência/dedupe/cpf
-- - Índices únicos/parciais só se ainda não existirem
-- - Não remove nem renomeia colunas
-- - Não altera nem duplica policies RLS
-- - Preserva dados existentes
-- - NOTIFY pgrst para recarregar o schema cache
--
-- Pré-requisito recomendado: PRODUCAO_14 (crm_leads).
-- Se PRODUCAO_25 (integrations) existir, integration_id ganha FK.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Colunas de origem / idempotência
-- ------------------------------------------------------------
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS external_lead_id text;

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS source_payload jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crm_leads'
      AND column_name = 'integration_id'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'integrations'
    ) THEN
      ALTER TABLE public.crm_leads
        ADD COLUMN integration_id uuid
        REFERENCES public.integrations(id) ON DELETE SET NULL;
    ELSE
      ALTER TABLE public.crm_leads
        ADD COLUMN integration_id uuid;
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN public.crm_leads.integration_id IS
  'Integração que criou o lead (NULL = criado manualmente / Smart Hub sem integração)';
COMMENT ON COLUMN public.crm_leads.external_lead_id IS
  'Id do lead no provedor (leadgen_id do Meta, submission id do formulário, etc.)';
COMMENT ON COLUMN public.crm_leads.source_payload IS
  'Payload recebido da integração/captação, para auditoria e reprocessamento';

-- ------------------------------------------------------------
-- 2. Índice único composto (clinic_id + integration_id + external_lead_id)
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_leads_external_lead
  ON public.crm_leads (clinic_id, integration_id, external_lead_id)
  WHERE external_lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_integration
  ON public.crm_leads (clinic_id, integration_id);

-- ------------------------------------------------------------
-- 3. Dedupe por telefone/e-mail (colunas geradas + índices parciais)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crm_leads'
      AND column_name = 'phone_dedupe_key'
  ) THEN
    ALTER TABLE public.crm_leads
      ADD COLUMN phone_dedupe_key text
      GENERATED ALWAYS AS (
        NULLIF(RIGHT(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10), '')
      ) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crm_leads'
      AND column_name = 'email_dedupe_key'
  ) THEN
    ALTER TABLE public.crm_leads
      ADD COLUMN email_dedupe_key text
      GENERATED ALWAYS AS (NULLIF(lower(btrim(COALESCE(email, ''))), '')) STORED;
  END IF;
END $$;

COMMENT ON COLUMN public.crm_leads.phone_dedupe_key IS
  'Últimos 10 dígitos do telefone; usado para não duplicar lead da mesma pessoa';
COMMENT ON COLUMN public.crm_leads.email_dedupe_key IS
  'E-mail normalizado; usado para não duplicar lead da mesma pessoa';

CREATE INDEX IF NOT EXISTS idx_crm_leads_clinic_phone_key
  ON public.crm_leads (clinic_id, phone_dedupe_key)
  WHERE phone_dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_clinic_email_key
  ON public.crm_leads (clinic_id, email_dedupe_key)
  WHERE email_dedupe_key IS NOT NULL;

-- ------------------------------------------------------------
-- 4. owner_user_id / created_by nullable (leads sem responsável)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 5. CPF no insert do ingestLead (PRODUCAO_20) — só se faltar
-- ------------------------------------------------------------
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS cpf text;

COMMENT ON COLUMN public.crm_leads.cpf IS
  'CPF do lead, opcional; usado pelo Kanban e pelo ingestLead';

COMMIT;

-- Recarrega o schema cache do PostgREST (obrigatório após ADD COLUMN)
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFICAÇÃO (somente leitura)
-- ============================================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'crm_leads'
  AND column_name IN (
    'integration_id', 'external_lead_id', 'source_payload',
    'phone_dedupe_key', 'email_dedupe_key', 'cpf'
  )
ORDER BY column_name;

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'crm_leads'
  AND indexname IN (
    'uq_crm_leads_external_lead',
    'idx_crm_leads_integration',
    'idx_crm_leads_clinic_phone_key',
    'idx_crm_leads_clinic_email_key'
  )
ORDER BY indexname;

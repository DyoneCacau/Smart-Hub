-- ============================================================================
-- CRM LEADS — sync de schema para API de leads / Smart Hub (ingestLead)
-- ============================================================================
-- Idempotente. Preserva dados. Não remove nem renomeia colunas.
-- Não altera policies RLS.
--
-- Corrige ausência de colunas de origem (PRODUCAO_26) que o ingestLead
-- envia no INSERT: integration_id, external_lead_id, source_payload,
-- além das colunas geradas de dedupe e índices.
-- ============================================================================

-- ------------------------------------------------------------
-- 1. Colunas de origem / idempotência (API universal de leads)
-- ------------------------------------------------------------
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS external_lead_id text;

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS source_payload jsonb;

-- integration_id com FK só se public.integrations existir
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
-- 2. Índices de idempotência e lookup (só se ainda não existirem)
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_leads_external_lead
  ON public.crm_leads (clinic_id, integration_id, external_lead_id)
  WHERE external_lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_integration
  ON public.crm_leads (clinic_id, integration_id);

-- ------------------------------------------------------------
-- 3. Chaves geradas de dedupe por contato (multi-tenant por clinic_id)
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
-- 4. owner_user_id / created_by podem ser nulos (leads de integração)
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
-- 5. CPF usado no insert do ingestLead (PRODUCAO_20) — só se faltar
-- ------------------------------------------------------------
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS cpf text;

-- ------------------------------------------------------------
-- 6. Recarrega o schema cache do PostgREST (evita PGRST204)
-- ------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

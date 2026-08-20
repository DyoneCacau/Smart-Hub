-- ============================================================================
-- PRODUÇÃO 20 — CAMPOS PARA SINCRONIZAÇÃO CRM (KANBAN) ↔ PACIENTE (EXECUÇÃO MANUAL)
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Execute este arquivo MANUALMENTE no SQL Editor do painel Supabase
--    (Dashboard > SQL Editor > New query). NÃO rode via CLI/db push.
-- 2. O script é idempotente (usa IF NOT EXISTS / DROP...IF EXISTS) e pode
--    ser executado novamente sem efeitos colaterais.
-- 3. Depois de rodar, publique as Edge Functions e o frontend atualizados
--    (o app já está preparado para usar estas colunas).
--
-- O QUE ESTE SCRIPT FAZ:
-- - Adiciona `cpf` e `allergies` em `crm_leads`, para o CPF e as alergias
--   informados no Kanban poderem ser levados ao criar o paciente.
-- - Adiciona `lead_source` e `referral_name` em `patients`, para a origem
--   do lead (Instagram, WhatsApp, Indicação, etc.) ficar como campo próprio
--   no cadastro do paciente, em vez de apenas texto em observações.
-- ============================================================================

BEGIN;

-- ─── crm_leads: CPF e alergias capturados no Kanban ────────────────────────
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS allergies text[] DEFAULT '{}';

COMMENT ON COLUMN public.crm_leads.cpf IS
  'CPF do lead, opcional; copiado para patients.cpf ao criar o paciente pelo Kanban';
COMMENT ON COLUMN public.crm_leads.allergies IS
  'Alergias informadas ainda no lead; copiadas para patients.allergies ao criar o paciente';

-- ─── patients: origem do lead como campo estruturado ───────────────────────
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS referral_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.patients'::regclass
      AND conname = 'patients_lead_source_check'
  ) THEN
    ALTER TABLE public.patients
      ADD CONSTRAINT patients_lead_source_check
      CHECK (
        lead_source IS NULL
        OR lead_source IN ('instagram', 'whatsapp', 'facebook', 'referral', 'paid_traffic', 'other')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.patients.lead_source IS
  'Origem do lead que deu origem ao paciente (mesmo enum de crm_leads.lead_source)';
COMMENT ON COLUMN public.patients.referral_name IS
  'Nome de quem indicou, quando lead_source = referral';

COMMIT;

-- VALIDAÇÃO MANUAL APÓS EXECUTAR:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'crm_leads' AND column_name IN ('cpf', 'allergies');
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'patients' AND column_name IN ('lead_source', 'referral_name');

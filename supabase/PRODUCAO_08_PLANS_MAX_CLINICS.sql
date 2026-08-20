-- ============================================================================
-- PRODUÇÃO 08 — COLUNA plans.max_clinics
-- ============================================================================
-- INSTRUÇÕES: execute no SQL Editor ou via CLI linked. Idempotente.
-- Motivo: create-complete-client / add-clinic-unit exigem max_clinics.
-- ============================================================================

BEGIN;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_clinics integer DEFAULT 999;

COMMENT ON COLUMN public.plans.max_clinics IS
  'Máximo de clínicas/unidades por cliente. 999 = ilimitado.';

UPDATE public.plans
SET max_clinics = 999
WHERE max_clinics IS NULL;

COMMIT;

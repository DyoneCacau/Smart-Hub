-- ============================================================================
-- PRODUÇÃO 06 — ATRASO DA 1ª MENSALIDADE (PROMO 30/60)
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Execute MANUALMENTE no SQL Editor do painel Supabase (ou via CLI linked).
-- 2. Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_defer_days integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND conname = 'subscriptions_billing_defer_days_check'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_billing_defer_days_check
      CHECK (billing_defer_days IN (0, 30, 60));
  END IF;
END $$;

COMMENT ON COLUMN public.subscriptions.billing_defer_days IS
  '0 = imediato com pró-rata; 30/60 = 1ª mensalidade após N dias (promo implantação)';

COMMIT;

-- ============================================================================
-- PRODUÇÃO 07 — DATA ESCOLHIDA PARA 1ª MENSALIDADE (CALENDÁRIO)
-- ============================================================================
-- INSTRUÇÕES: execute no SQL Editor ou via CLI linked. Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_first_due_date date;

COMMENT ON COLUMN public.subscriptions.billing_first_due_date IS
  'Data da 1ª mensalidade quando modo promo/agenda está ativo; null = cobrança imediata com pró-rata';

COMMIT;

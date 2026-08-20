-- Permite que membros da clinica (clinic_users) vejam/criem/editem/removam lancamentos financeiros.
-- Evita bloqueio por user_has_feature('financeiro') quando a assinatura/feature nao esta sincronizada.

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view clinic transactions with feature" ON public.financial_transactions;
DROP POLICY IF EXISTS "Users can insert transactions with feature" ON public.financial_transactions;
DROP POLICY IF EXISTS "Users can update transactions with feature" ON public.financial_transactions;

DROP POLICY IF EXISTS "Users can view clinic transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Users can insert clinic transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Users can update clinic transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Users can delete clinic transactions" ON public.financial_transactions;

CREATE POLICY "Users can view clinic transactions"
ON public.financial_transactions FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert clinic transactions"
ON public.financial_transactions FOR INSERT
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND user_id = auth.uid()
);

CREATE POLICY "Users can update clinic transactions"
ON public.financial_transactions FOR UPDATE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
)
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete clinic transactions"
ON public.financial_transactions FOR DELETE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);


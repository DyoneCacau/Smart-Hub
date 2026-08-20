-- Permite que membros da clinica (clinic_users) vejam/criem/atualizem comissoes.
-- Evita bloqueio por user_has_feature('comissoes') quando a assinatura/feature nao esta sincronizada.

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

-- Remover antigas e novas (para permitir reexecutar o script)
DROP POLICY IF EXISTS "Users can view clinic commissions with feature" ON public.commissions;
DROP POLICY IF EXISTS "Users can insert commissions with feature" ON public.commissions;
DROP POLICY IF EXISTS "Users can update pending commissions with feature" ON public.commissions;
DROP POLICY IF EXISTS "Users can view clinic commissions" ON public.commissions;
DROP POLICY IF EXISTS "Users can insert clinic commissions" ON public.commissions;
DROP POLICY IF EXISTS "Users can update clinic commissions" ON public.commissions;

CREATE POLICY "Users can view clinic commissions"
ON public.commissions FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert clinic commissions"
ON public.commissions FOR INSERT
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update clinic commissions"
ON public.commissions FOR UPDATE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND status = 'pending'
)
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

-- Corrige RLS de inventory_products para permitir INSERT/UPDATE/DELETE.
-- Evita bloqueio por user_has_feature('estoque') quando a assinatura/feature nao esta sincronizada.
-- Quem pode gerenciar: usuarios vinculados a clinica (clinic_users). O acesso ao menu Estoque continua controlado pelo app.

ALTER TABLE public.inventory_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view clinic products with feature" ON public.inventory_products;
DROP POLICY IF EXISTS "Users can manage products with feature" ON public.inventory_products;

CREATE POLICY "Users can view clinic products"
ON public.inventory_products FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert clinic products"
ON public.inventory_products FOR INSERT
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update clinic products"
ON public.inventory_products FOR UPDATE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
)
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete clinic products"
ON public.inventory_products FOR DELETE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

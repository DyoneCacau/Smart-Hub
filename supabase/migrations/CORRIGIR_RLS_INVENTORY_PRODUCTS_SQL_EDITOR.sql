-- ============================================================
-- CORRIGIR RLS INVENTORY_PRODUCTS - Execute no SQL Editor do Supabase
-- Erro: new row violates row-level security policy for table inventory_products
-- ============================================================

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

-- ============================================================
-- INVENTORY_MOVEMENTS - Mesma correção para movimentações
-- ============================================================

DROP POLICY IF EXISTS "Users can view movements with feature" ON public.inventory_movements;
DROP POLICY IF EXISTS "Users can insert movements with feature" ON public.inventory_movements;

CREATE POLICY "Users can view clinic movements"
ON public.inventory_movements FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert clinic movements"
ON public.inventory_movements FOR INSERT
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

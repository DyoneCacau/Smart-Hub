-- Função para verificar se usuário tem acesso a uma feature específica
-- Baseado no plano da clínica do usuário
CREATE OR REPLACE FUNCTION public.user_has_feature(_user_id uuid, _feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- SuperAdmin sempre tem acesso
    CASE 
      WHEN public.is_superadmin(_user_id) THEN true
      -- Features sempre disponíveis
      WHEN _feature IN ('dashboard', 'configuracoes') THEN true
      ELSE (
        SELECT 
          CASE 
            WHEN s.status IN ('active', 'trial') AND 
                 (s.trial_ends_at IS NULL OR s.trial_ends_at > now()) THEN
              -- Verificar se a feature está no array de features do plano
              COALESCE(p.features::jsonb ? _feature, false)
            ELSE false
          END
        FROM public.clinic_users cu
        JOIN public.subscriptions s ON s.clinic_id = cu.clinic_id
        LEFT JOIN public.plans p ON p.id = s.plan_id
        WHERE cu.user_id = _user_id
        LIMIT 1
      )
    END
$$;

-- Função para obter o status da assinatura do usuário
CREATE OR REPLACE FUNCTION public.get_user_subscription_status(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN public.is_superadmin(_user_id) THEN 'active'
      ELSE (
        SELECT 
          CASE 
            WHEN s.status = 'trial' AND s.trial_ends_at < now() THEN 'expired'
            ELSE s.status
          END
        FROM public.clinic_users cu
        JOIN public.subscriptions s ON s.clinic_id = cu.clinic_id
        WHERE cu.user_id = _user_id
        LIMIT 1
      )
    END
$$;

-- Função para verificar se a assinatura está ativa (não bloqueada)
CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN public.is_superadmin(_user_id) THEN true
      ELSE (
        SELECT 
          CASE 
            WHEN s.status IN ('active', 'trial') AND 
                 (s.trial_ends_at IS NULL OR s.trial_ends_at > now()) THEN true
            ELSE false
          END
        FROM public.clinic_users cu
        JOIN public.subscriptions s ON s.clinic_id = cu.clinic_id
        WHERE cu.user_id = _user_id
        LIMIT 1
      )
    END
$$;

-- ============================================
-- Aplicar RLS com validação de features
-- ============================================

-- TIME_CLOCK_ENTRIES: Requer feature 'ponto'
DROP POLICY IF EXISTS "Users can insert their own entries" ON public.time_clock_entries;
CREATE POLICY "Users can insert their own entries with feature check"
ON public.time_clock_entries
FOR INSERT
WITH CHECK (
  auth.uid() = user_id 
  AND public.user_has_feature(auth.uid(), 'ponto')
);

DROP POLICY IF EXISTS "Users can view their own entries" ON public.time_clock_entries;
CREATE POLICY "Users can view their own entries with feature check"
ON public.time_clock_entries
FOR SELECT
USING (
  (auth.uid() = user_id AND public.user_has_feature(auth.uid(), 'ponto'))
  OR public.is_admin(auth.uid())
);

-- PROFESSIONALS: Requer feature 'profissionais' para modificar
DROP POLICY IF EXISTS "Admins can insert professionals" ON public.professionals;
CREATE POLICY "Admins can insert professionals with feature check"
ON public.professionals
FOR INSERT
WITH CHECK (
  public.is_admin(auth.uid()) 
  AND public.user_has_feature(auth.uid(), 'profissionais')
);

DROP POLICY IF EXISTS "Admins can update professionals" ON public.professionals;
CREATE POLICY "Admins can update professionals with feature check"
ON public.professionals
FOR UPDATE
USING (
  public.is_admin(auth.uid()) 
  AND public.user_has_feature(auth.uid(), 'profissionais')
);

DROP POLICY IF EXISTS "Admins can delete professionals" ON public.professionals;
CREATE POLICY "Admins can delete professionals with feature check"
ON public.professionals
FOR DELETE
USING (
  public.is_admin(auth.uid()) 
  AND public.user_has_feature(auth.uid(), 'profissionais')
);

-- ============================================
-- Criar tabelas para features que ainda não existem
-- ============================================

-- Tabela de transações financeiras (para feature 'financeiro')
CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  amount numeric NOT NULL,
  description text,
  category text,
  payment_method text,
  reference_id uuid,
  reference_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view clinic transactions with feature"
ON public.financial_transactions
FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM clinic_users WHERE user_id = auth.uid())
  AND public.user_has_feature(auth.uid(), 'financeiro')
);

CREATE POLICY "Users can insert transactions with feature"
ON public.financial_transactions
FOR INSERT
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM clinic_users WHERE user_id = auth.uid())
  AND public.user_has_feature(auth.uid(), 'financeiro')
);

CREATE POLICY "Users can update transactions with feature"
ON public.financial_transactions
FOR UPDATE
USING (
  clinic_id IN (SELECT clinic_id FROM clinic_users WHERE user_id = auth.uid())
  AND public.user_has_feature(auth.uid(), 'financeiro')
);

CREATE POLICY "Superadmins can manage all transactions"
ON public.financial_transactions
FOR ALL
USING (public.is_superadmin(auth.uid()));

-- Tabela de comissões (para feature 'comissoes')
CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  beneficiary_id uuid NOT NULL,
  beneficiary_type text NOT NULL CHECK (beneficiary_type IN ('professional', 'seller', 'reception')),
  appointment_id uuid,
  amount numeric NOT NULL,
  percentage numeric,
  base_value numeric,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  paid_at timestamptz,
  paid_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view clinic commissions with feature"
ON public.commissions
FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM clinic_users WHERE user_id = auth.uid())
  AND public.user_has_feature(auth.uid(), 'comissoes')
);

CREATE POLICY "Users can insert commissions with feature"
ON public.commissions
FOR INSERT
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM clinic_users WHERE user_id = auth.uid())
  AND public.user_has_feature(auth.uid(), 'comissoes')
);

-- Comissões pagas são imutáveis - apenas pending podem ser atualizadas
CREATE POLICY "Users can update pending commissions with feature"
ON public.commissions
FOR UPDATE
USING (
  clinic_id IN (SELECT clinic_id FROM clinic_users WHERE user_id = auth.uid())
  AND public.user_has_feature(auth.uid(), 'comissoes')
  AND status = 'pending'
);

CREATE POLICY "Superadmins can manage all commissions"
ON public.commissions
FOR ALL
USING (public.is_superadmin(auth.uid()));

-- Tabela de estoque (para feature 'estoque')
CREATE TABLE IF NOT EXISTS public.inventory_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  category text,
  description text,
  unit text DEFAULT 'un',
  current_stock integer NOT NULL DEFAULT 0,
  minimum_stock integer DEFAULT 0,
  cost_price numeric DEFAULT 0,
  sale_price numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view clinic products with feature"
ON public.inventory_products
FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM clinic_users WHERE user_id = auth.uid())
  AND public.user_has_feature(auth.uid(), 'estoque')
);

CREATE POLICY "Users can manage products with feature"
ON public.inventory_products
FOR ALL
USING (
  clinic_id IN (SELECT clinic_id FROM clinic_users WHERE user_id = auth.uid())
  AND public.user_has_feature(auth.uid(), 'estoque')
);

CREATE POLICY "Superadmins can manage all products"
ON public.inventory_products
FOR ALL
USING (public.is_superadmin(auth.uid()));

-- Tabela de movimentações de estoque
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('entrada', 'saida', 'ajuste')),
  quantity integer NOT NULL,
  previous_stock integer NOT NULL,
  new_stock integer NOT NULL,
  reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view movements with feature"
ON public.inventory_movements
FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM clinic_users WHERE user_id = auth.uid())
  AND public.user_has_feature(auth.uid(), 'estoque')
);

CREATE POLICY "Users can insert movements with feature"
ON public.inventory_movements
FOR INSERT
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM clinic_users WHERE user_id = auth.uid())
  AND public.user_has_feature(auth.uid(), 'estoque')
);

CREATE POLICY "Superadmins can manage all movements"
ON public.inventory_movements
FOR ALL
USING (public.is_superadmin(auth.uid()));

-- Triggers para updated_at
CREATE TRIGGER update_financial_transactions_updated_at
BEFORE UPDATE ON public.financial_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_commissions_updated_at
BEFORE UPDATE ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inventory_products_updated_at
BEFORE UPDATE ON public.inventory_products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
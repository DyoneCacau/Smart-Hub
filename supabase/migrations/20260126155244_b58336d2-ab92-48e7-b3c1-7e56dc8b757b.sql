-- Tabela de planos disponíveis na plataforma
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_yearly DECIMAL(10,2),
  max_users INTEGER,
  max_patients INTEGER,
  features JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de clínicas (tenants)
CREATE TABLE public.clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  email TEXT NOT NULL,
  phone TEXT,
  cnpj TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  logo_url TEXT,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de assinaturas das clínicas
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL,
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'suspended', 'cancelled', 'expired')),
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'overdue', 'failed')),
  last_payment_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de associação usuário-clínica (um usuário pertence a uma clínica)
CREATE TABLE public.clinic_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  is_owner BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(clinic_id, user_id)
);

-- Tabela de histórico de pagamentos
CREATE TABLE public.payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT,
  payment_proof_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de módulos disponíveis por plano
CREATE TABLE public.plan_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES public.plans(id) ON DELETE CASCADE NOT NULL,
  module_name TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_modules ENABLE ROW LEVEL SECURITY;

-- Função helper para verificar se é superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'superadmin'
  )
$$;

-- Função helper para obter clinic_id do usuário
CREATE OR REPLACE FUNCTION public.get_user_clinic_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clinic_id
  FROM public.clinic_users
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- RLS para plans (todos podem ver planos ativos, apenas superadmin pode gerenciar)
CREATE POLICY "Anyone can view active plans" ON public.plans
  FOR SELECT USING (is_active = true OR is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can insert plans" ON public.plans
  FOR INSERT WITH CHECK (is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can update plans" ON public.plans
  FOR UPDATE USING (is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can delete plans" ON public.plans
  FOR DELETE USING (is_superadmin(auth.uid()));

-- RLS para clinics
CREATE POLICY "Superadmins can view all clinics" ON public.clinics
  FOR SELECT USING (is_superadmin(auth.uid()));

CREATE POLICY "Clinic users can view their clinic" ON public.clinics
  FOR SELECT USING (
    id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Superadmins can insert clinics" ON public.clinics
  FOR INSERT WITH CHECK (is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can update clinics" ON public.clinics
  FOR UPDATE USING (is_superadmin(auth.uid()));

CREATE POLICY "Clinic owners can update their clinic" ON public.clinics
  FOR UPDATE USING (owner_user_id = auth.uid());

CREATE POLICY "Superadmins can delete clinics" ON public.clinics
  FOR DELETE USING (is_superadmin(auth.uid()));

-- RLS para subscriptions
CREATE POLICY "Superadmins can view all subscriptions" ON public.subscriptions
  FOR SELECT USING (is_superadmin(auth.uid()));

CREATE POLICY "Clinic users can view their subscription" ON public.subscriptions
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Superadmins can manage subscriptions" ON public.subscriptions
  FOR ALL USING (is_superadmin(auth.uid()));

-- RLS para clinic_users
CREATE POLICY "Superadmins can view all clinic_users" ON public.clinic_users
  FOR SELECT USING (is_superadmin(auth.uid()));

CREATE POLICY "Users can view their clinic members" ON public.clinic_users
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Superadmins can manage clinic_users" ON public.clinic_users
  FOR ALL USING (is_superadmin(auth.uid()));

CREATE POLICY "Clinic admins can manage their clinic_users" ON public.clinic_users
  FOR ALL USING (
    clinic_id IN (
      SELECT cu.clinic_id FROM public.clinic_users cu 
      JOIN public.user_roles ur ON cu.user_id = ur.user_id
      WHERE cu.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- RLS para payment_history
CREATE POLICY "Superadmins can view all payments" ON public.payment_history
  FOR SELECT USING (is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can manage payments" ON public.payment_history
  FOR ALL USING (is_superadmin(auth.uid()));

-- RLS para plan_modules
CREATE POLICY "Anyone can view plan modules" ON public.plan_modules
  FOR SELECT USING (true);

CREATE POLICY "Superadmins can manage plan modules" ON public.plan_modules
  FOR ALL USING (is_superadmin(auth.uid()));

-- Triggers para updated_at
CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clinics_updated_at
  BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir planos iniciais
INSERT INTO public.plans (name, slug, description, price_monthly, features) VALUES
  ('Trial', 'trial', 'Período de teste de 7 dias com acesso limitado', 0, '["agenda", "pacientes_basico"]'),
  ('Plano 1 - Básico', 'basico', 'Acesso às funcionalidades essenciais', 99.90, '["agenda", "pacientes", "financeiro_basico"]'),
  ('Plano 2 - Profissional', 'profissional', 'Funcionalidades avançadas para clínicas em crescimento', 199.90, '["agenda", "pacientes", "financeiro", "relatorios", "profissionais"]'),
  ('Plano Premium', 'premium', 'Acesso completo a todas as funcionalidades', 349.90, '["agenda", "pacientes", "financeiro", "relatorios", "profissionais", "comissoes", "estoque", "termos", "multi_clinica"]');
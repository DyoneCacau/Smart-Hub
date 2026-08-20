-- Tabela de solicitações de upgrade (leads internos)
CREATE TABLE public.upgrade_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id),
  requested_by UUID NOT NULL,
  requested_feature TEXT,
  requested_plan_id UUID REFERENCES public.plans(id),
  current_plan_id UUID REFERENCES public.plans(id),
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  admin_notes TEXT,
  processed_by UUID,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_upgrade_requests_clinic ON public.upgrade_requests(clinic_id);
CREATE INDEX idx_upgrade_requests_status ON public.upgrade_requests(status);
CREATE INDEX idx_upgrade_requests_created ON public.upgrade_requests(created_at DESC);

-- RLS
ALTER TABLE public.upgrade_requests ENABLE ROW LEVEL SECURITY;

-- SuperAdmin pode ver e gerenciar todas as solicitações
CREATE POLICY "SuperAdmins can manage all upgrade requests"
ON public.upgrade_requests
FOR ALL
TO authenticated
USING (public.is_superadmin(auth.uid()));

-- Usuários podem ver solicitações da própria clínica
CREATE POLICY "Users can view own clinic requests"
ON public.upgrade_requests
FOR SELECT
TO authenticated
USING (clinic_id = public.get_user_clinic_id(auth.uid()));

-- Usuários podem criar solicitações para própria clínica
CREATE POLICY "Users can create own clinic requests"
ON public.upgrade_requests
FOR INSERT
TO authenticated
WITH CHECK (clinic_id = public.get_user_clinic_id(auth.uid()) AND requested_by = auth.uid());

-- Trigger updated_at
CREATE TRIGGER update_upgrade_requests_updated_at
BEFORE UPDATE ON public.upgrade_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de notificações internas (para SuperAdmin)
CREATE TABLE public.admin_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  reference_type TEXT,
  reference_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS para notificações
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Apenas SuperAdmins veem notificações
CREATE POLICY "SuperAdmins can manage notifications"
ON public.admin_notifications
FOR ALL
TO authenticated
USING (public.is_superadmin(auth.uid()));
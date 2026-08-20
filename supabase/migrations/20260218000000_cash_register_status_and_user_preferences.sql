-- Tabela: status do caixa (aberto/fechado) por clínica e data - compartilhado entre usuários
CREATE TABLE IF NOT EXISTS public.cash_register_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  status_date date NOT NULL,
  is_open boolean NOT NULL DEFAULT false,
  opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at timestamptz,
  closed_at timestamptz,
  UNIQUE(clinic_id, status_date)
);

CREATE INDEX IF NOT EXISTS idx_cash_register_status_clinic_date ON public.cash_register_status(clinic_id, status_date DESC);

ALTER TABLE public.cash_register_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view clinic cash register status"
ON public.cash_register_status FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert clinic cash register status"
ON public.cash_register_status FOR INSERT
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update clinic cash register status"
ON public.cash_register_status FOR UPDATE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
)
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

-- Tabela: preferências do usuário (clínica selecionada, etc.) - sincroniza entre dispositivos
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preference_key text NOT NULL,
  preference_value text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, preference_key)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_key ON public.user_preferences(user_id, preference_key);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences"
ON public.user_preferences FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own preferences"
ON public.user_preferences FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own preferences"
ON public.user_preferences FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own preferences"
ON public.user_preferences FOR DELETE
USING (user_id = auth.uid());

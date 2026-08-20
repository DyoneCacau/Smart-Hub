-- Tabela de regras de comissão por clínica (compartilhada entre todos os usuários da clínica)
CREATE TABLE IF NOT EXISTS public.commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id text NOT NULL,
  beneficiary_type text NOT NULL,
  beneficiary_id text,
  beneficiary_name text,
  procedure text NOT NULL,
  day_of_week text NOT NULL,
  calculation_type text NOT NULL,
  calculation_unit text NOT NULL,
  value numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_rules_clinic_id ON public.commission_rules(clinic_id);

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

-- Membros da clínica podem ver/inserir/atualizar/remover regras da própria clínica
CREATE POLICY "Users can view clinic commission rules"
ON public.commission_rules FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert clinic commission rules"
ON public.commission_rules FOR INSERT
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update clinic commission rules"
ON public.commission_rules FOR UPDATE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
)
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete clinic commission rules"
ON public.commission_rules FOR DELETE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

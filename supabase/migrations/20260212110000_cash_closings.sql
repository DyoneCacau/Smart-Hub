-- Tabela para registrar fechamentos de caixa (evitar acumular dias sem encerrar)
CREATE TABLE IF NOT EXISTS cash_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  closing_date DATE NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(clinic_id, closing_date)
);

CREATE INDEX IF NOT EXISTS idx_cash_closings_clinic_date ON cash_closings(clinic_id, closing_date DESC);

ALTER TABLE cash_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinic users can view own cash_closings"
  ON cash_closings FOR SELECT TO authenticated
  USING (
    clinic_id IN (SELECT clinic_id FROM clinic_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Clinic users can insert own cash_closings"
  ON cash_closings FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM clinic_users WHERE user_id = auth.uid())
  );

CREATE POLICY "SuperAdmin full access to cash_closings"
  ON cash_closings FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()));

COMMENT ON TABLE cash_closings IS 'Registro de fechamento de caixa por dia/clínica para alertas ao admin';

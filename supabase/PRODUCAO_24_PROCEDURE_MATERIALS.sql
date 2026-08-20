-- ============================================================
-- PRODUÇÃO 24 — MATERIAIS DO PROCEDIMENTO + BAIXA NO ESTOQUE
-- ============================================================
-- INSTRUÇÕES:
-- 1. Revise este arquivo antes de executar.
-- 2. No Supabase, abra SQL Editor > New query.
-- 3. Cole TODO o conteúdo deste arquivo e clique em Run.
-- 4. Confirme ao final que a consulta de verificação não retorna erro.
--
-- Este script NÃO é executado automaticamente pelo deploy da Vercel.
--
-- O que faz:
-- - Permite composição sugerida de materiais por procedimento (odonto/estética)
-- - Registra o que foi usado na finalização do agendamento
-- - Aceita quantidades fracionadas (ex.: 0,2 ml de toxina)
-- - Liga a saída de estoque ao agendamento (origem rastreável)
-- - Cria permissão "estoque_liberar" para finalizar mesmo sem saldo
-- ============================================================

BEGIN;

-- Quantidades fracionadas (ml, g) para harmonização facial / odontologia
ALTER TABLE public.inventory_products
  ALTER COLUMN current_stock TYPE numeric(12,3) USING current_stock::numeric,
  ALTER COLUMN minimum_stock TYPE numeric(12,3) USING minimum_stock::numeric;

ALTER TABLE public.inventory_movements
  ALTER COLUMN quantity TYPE numeric(12,3) USING quantity::numeric,
  ALTER COLUMN previous_stock TYPE numeric(12,3) USING previous_stock::numeric,
  ALTER COLUMN new_stock TYPE numeric(12,3) USING new_stock::numeric;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_appointment_id
  ON public.inventory_movements (appointment_id);

-- Composição sugerida do procedimento (editável na finalização)
CREATE TABLE IF NOT EXISTS public.clinic_procedure_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  procedure_id uuid NOT NULL REFERENCES public.clinic_procedures(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
  default_quantity numeric(12,3) NOT NULL CHECK (default_quantity > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (procedure_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_clinic_procedure_materials_procedure
  ON public.clinic_procedure_materials (procedure_id);
CREATE INDEX IF NOT EXISTS idx_clinic_procedure_materials_clinic
  ON public.clinic_procedure_materials (clinic_id);

DROP TRIGGER IF EXISTS clinic_procedure_materials_updated_at ON public.clinic_procedure_materials;
CREATE TRIGGER clinic_procedure_materials_updated_at
  BEFORE UPDATE ON public.clinic_procedure_materials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.clinic_procedure_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic members can view procedure materials" ON public.clinic_procedure_materials;
CREATE POLICY "Clinic members can view procedure materials"
  ON public.clinic_procedure_materials
  FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid())
    OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Clinic members can manage procedure materials" ON public.clinic_procedure_materials;
CREATE POLICY "Clinic members can manage procedure materials"
  ON public.clinic_procedure_materials
  FOR ALL
  TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR clinic_id IN (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR clinic_id IN (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid())
  );

-- Uso real na finalização (histórico do paciente / agendamento)
CREATE TABLE IF NOT EXISTS public.appointment_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  product_unit text,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  movement_id uuid REFERENCES public.inventory_movements(id) ON DELETE SET NULL,
  overridden boolean NOT NULL DEFAULT false,
  override_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_materials_appointment
  ON public.appointment_materials (appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_materials_clinic
  ON public.appointment_materials (clinic_id);

ALTER TABLE public.appointment_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic members can view appointment materials" ON public.appointment_materials;
CREATE POLICY "Clinic members can view appointment materials"
  ON public.appointment_materials
  FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid())
    OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Clinic members can manage appointment materials" ON public.appointment_materials;
CREATE POLICY "Clinic members can manage appointment materials"
  ON public.appointment_materials
  FOR ALL
  TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR clinic_id IN (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR clinic_id IN (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid())
  );

-- Permissão: liberar finalização sem saldo (emprestado de outra unidade / aguardando fornecedor)
INSERT INTO public.clinic_role_permissions (clinic_id, role, feature, can_view, can_create, can_edit, can_delete)
SELECT
  c.id,
  r.role,
  'estoque_liberar',
  true,
  false,
  CASE WHEN r.role IN ('admin', 'receptionist') THEN true ELSE false END,
  false
FROM public.clinics c
CROSS JOIN (VALUES ('admin'), ('receptionist'), ('seller'), ('professional')) AS r(role)
ON CONFLICT (clinic_id, role, feature) DO NOTHING;

COMMIT;

-- VERIFICAÇÃO (somente leitura):
SELECT 'clinic_procedure_materials' AS tabela, count(*)::int AS colunas
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'clinic_procedure_materials'
UNION ALL
SELECT 'appointment_materials', count(*)::int
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'appointment_materials'
UNION ALL
SELECT 'inventory_movements.appointment_id', count(*)::int
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'inventory_movements' AND column_name = 'appointment_id';

-- ============================================================
-- MIGRATION — agenda_work_schedules_foundation (Fase 0)
-- Espelho versionado de supabase/PRODUCAO_35_PUBLIC_BOOKING_FOUNDATION.sql
-- Preferir execução manual do PRODUCAO_35 no SQL Editor.
-- Fonte de verdade: schema auditado em produção.
-- ============================================================
-- INSTRUÇÕES:
-- 1. Revise este arquivo antes de executar.
-- 2. No Supabase: SQL Editor > New query.
-- 3. Cole TODO o conteúdo e clique em Run.
-- 4. Script IDEMPOTENTE: seguro se as tabelas já existirem como em produção.
-- 5. NÃO dropar tabelas. NÃO renomear colunas. NÃO criar professional_clinics.
-- 6. Este script NÃO sobe com o deploy da Vercel — execução manual.
--
-- Fonte de verdade: schema auditado em produção (tabelas vazias).
-- weekday 0–6 | schedule_blocks usa block_date + all_day + block_type.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Função updated_at (já pode existir no projeto)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- professional_work_schedules
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.professional_work_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  weekday smallint NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  CONSTRAINT professional_work_schedules_time_check CHECK (end_time > start_time),
  CONSTRAINT professional_work_schedules_weekday_check CHECK (weekday >= 0 AND weekday <= 6)
);

-- Garante constraints caso a tabela já exista sem elas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'professional_work_schedules_time_check'
  ) THEN
    ALTER TABLE public.professional_work_schedules
      ADD CONSTRAINT professional_work_schedules_time_check CHECK (end_time > start_time);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'professional_work_schedules_weekday_check'
  ) THEN
    ALTER TABLE public.professional_work_schedules
      ADD CONSTRAINT professional_work_schedules_weekday_check
      CHECK (weekday >= 0 AND weekday <= 6);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_professional_work_schedules_period'
  ) THEN
    ALTER TABLE public.professional_work_schedules
      ADD CONSTRAINT uq_professional_work_schedules_period
      UNIQUE (clinic_id, professional_id, weekday, start_time, end_time);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pws_clinic_professional
  ON public.professional_work_schedules (clinic_id, professional_id);

CREATE INDEX IF NOT EXISTS idx_pws_clinic_weekday
  ON public.professional_work_schedules (clinic_id, weekday)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_pws_professional_active
  ON public.professional_work_schedules (professional_id, weekday)
  WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.validate_professional_work_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof_clinic uuid;
  v_overlap boolean;
BEGIN
  SELECT p.clinic_id INTO v_prof_clinic
  FROM public.professionals p
  WHERE p.id = NEW.professional_id;

  IF v_prof_clinic IS NULL THEN
    RAISE EXCEPTION 'Profissional não encontrado.';
  END IF;

  IF v_prof_clinic IS DISTINCT FROM NEW.clinic_id THEN
    RAISE EXCEPTION 'Profissional não pertence a esta clínica.';
  END IF;

  IF NEW.is_active IS TRUE THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.professional_work_schedules s
      WHERE s.clinic_id = NEW.clinic_id
        AND s.professional_id = NEW.professional_id
        AND s.weekday = NEW.weekday
        AND s.is_active IS TRUE
        AND s.id IS DISTINCT FROM NEW.id
        AND s.start_time < NEW.end_time
        AND s.end_time > NEW.start_time
    ) INTO v_overlap;

    IF v_overlap THEN
      RAISE EXCEPTION 'Este período se sobrepõe a outro horário.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS professional_work_schedules_updated_at
  ON public.professional_work_schedules;
CREATE TRIGGER professional_work_schedules_updated_at
  BEFORE UPDATE ON public.professional_work_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_validate_professional_work_schedule
  ON public.professional_work_schedules;
CREATE TRIGGER trg_validate_professional_work_schedule
  BEFORE INSERT OR UPDATE ON public.professional_work_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_professional_work_schedule();

ALTER TABLE public.professional_work_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view work schedules"
  ON public.professional_work_schedules;
DROP POLICY IF EXISTS "Members can create work schedules"
  ON public.professional_work_schedules;
DROP POLICY IF EXISTS "Members can update work schedules"
  ON public.professional_work_schedules;
DROP POLICY IF EXISTS "Members can delete work schedules"
  ON public.professional_work_schedules;

CREATE POLICY "Members can view work schedules"
  ON public.professional_work_schedules
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR public.user_can_clinic_action(clinic_id, 'agenda', 'can_view')
  );

CREATE POLICY "Members can create work schedules"
  ON public.professional_work_schedules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR public.user_can_clinic_action(clinic_id, 'agenda', 'can_create')
  );

CREATE POLICY "Members can update work schedules"
  ON public.professional_work_schedules
  FOR UPDATE TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR public.user_can_clinic_action(clinic_id, 'agenda', 'can_edit')
  )
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR public.user_can_clinic_action(clinic_id, 'agenda', 'can_edit')
  );

CREATE POLICY "Members can delete work schedules"
  ON public.professional_work_schedules
  FOR DELETE TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR public.user_can_clinic_action(clinic_id, 'agenda', 'can_delete')
  );

-- ------------------------------------------------------------
-- schedule_blocks
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id uuid NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  block_date date NOT NULL,
  start_time time without time zone NULL,
  end_time time without time zone NULL,
  all_day boolean NOT NULL DEFAULT false,
  reason text NULL,
  block_type text NOT NULL DEFAULT 'other',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'schedule_blocks_block_type_check'
  ) THEN
    ALTER TABLE public.schedule_blocks
      ADD CONSTRAINT schedule_blocks_block_type_check
      CHECK (
        block_type IN (
          'break',
          'absence',
          'vacation',
          'holiday',
          'meeting',
          'maintenance',
          'other'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'schedule_blocks_window_check'
  ) THEN
    ALTER TABLE public.schedule_blocks
      ADD CONSTRAINT schedule_blocks_window_check
      CHECK (
        (
          all_day = true
          AND start_time IS NULL
          AND end_time IS NULL
        )
        OR (
          all_day = false
          AND start_time IS NOT NULL
          AND end_time IS NOT NULL
          AND end_time > start_time
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_clinic_date
  ON public.schedule_blocks (clinic_id, block_date)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_clinic_professional
  ON public.schedule_blocks (clinic_id, professional_id);

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_professional_date
  ON public.schedule_blocks (clinic_id, professional_id, block_date)
  WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.validate_schedule_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof_clinic uuid;
BEGIN
  IF NEW.professional_id IS NOT NULL THEN
    SELECT p.clinic_id INTO v_prof_clinic
    FROM public.professionals p
    WHERE p.id = NEW.professional_id;

    IF v_prof_clinic IS NULL THEN
      RAISE EXCEPTION 'Profissional não encontrado.';
    END IF;

    IF v_prof_clinic IS DISTINCT FROM NEW.clinic_id THEN
      RAISE EXCEPTION 'Profissional não pertence a esta clínica.';
    END IF;
  END IF;

  IF NEW.all_day IS TRUE THEN
    NEW.start_time := NULL;
    NEW.end_time := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schedule_blocks_updated_at ON public.schedule_blocks;
CREATE TRIGGER schedule_blocks_updated_at
  BEFORE UPDATE ON public.schedule_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_validate_schedule_block ON public.schedule_blocks;
CREATE TRIGGER trg_validate_schedule_block
  BEFORE INSERT OR UPDATE ON public.schedule_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_schedule_block();

ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view schedule blocks" ON public.schedule_blocks;
DROP POLICY IF EXISTS "Members can create schedule blocks" ON public.schedule_blocks;
DROP POLICY IF EXISTS "Members can update schedule blocks" ON public.schedule_blocks;
DROP POLICY IF EXISTS "Members can delete schedule blocks" ON public.schedule_blocks;

CREATE POLICY "Members can view schedule blocks"
  ON public.schedule_blocks
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR public.user_can_clinic_action(clinic_id, 'agenda', 'can_view')
  );

CREATE POLICY "Members can create schedule blocks"
  ON public.schedule_blocks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR public.user_can_clinic_action(clinic_id, 'agenda', 'can_create')
  );

CREATE POLICY "Members can update schedule blocks"
  ON public.schedule_blocks
  FOR UPDATE TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR public.user_can_clinic_action(clinic_id, 'agenda', 'can_edit')
  )
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR public.user_can_clinic_action(clinic_id, 'agenda', 'can_edit')
  );

CREATE POLICY "Members can delete schedule blocks"
  ON public.schedule_blocks
  FOR DELETE TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR public.user_can_clinic_action(clinic_id, 'agenda', 'can_delete')
  );

-- Verificação
SELECT 'professional_work_schedules' AS tabela, COUNT(*)::bigint AS linhas
FROM public.professional_work_schedules
UNION ALL
SELECT 'schedule_blocks', COUNT(*)::bigint
FROM public.schedule_blocks;

NOTIFY pgrst, 'reload schema';

COMMIT;

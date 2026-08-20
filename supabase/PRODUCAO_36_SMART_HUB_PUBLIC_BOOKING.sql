-- ============================================================
-- PRODUÇÃO 36 — SMART HUB: FUNDAÇÃO DO AGENDAMENTO ONLINE (FASE B)
-- ============================================================
-- INSTRUÇÕES:
-- 1. Pré-requisitos: PRODUCAO_09 (procedimentos), PRODUCAO_35 (jornadas/bloqueios),
--    PRODUCAO_32/33 (Smart Hub + CRM capture), appointments RLS.
-- 2. Revise este arquivo antes de executar.
-- 3. No Supabase: SQL Editor > New query.
-- 4. Cole TODO o conteúdo e clique em Run.
-- 5. Script IDEMPOTENTE. NÃO dropa tabelas. NÃO ativa booking em hubs existentes
--    (public_booking_enabled DEFAULT false).
-- 6. Este script NÃO sobe com o deploy da Vercel — execução manual.
-- 7. Depois: deploy da Edge Function `smart-hub-booking --no-verify-jwt`
--    e NOTIFY pgrst, 'reload schema';
--
-- DIAGNÓSTICO DE CONFLITOS HISTÓRICOS (rode ANTES se quiser auditar):
--   SELECT a.id AS a_id, b.id AS b_id, a.clinic_id, a.professional_id, a.date,
--          a.start_time, a.end_time, a.status AS a_status, b.start_time AS b_start,
--          b.end_time AS b_end, b.status AS b_status
--   FROM public.appointments a
--   JOIN public.appointments b
--     ON a.clinic_id = b.clinic_id
--    AND a.professional_id = b.professional_id
--    AND a.date = b.date
--    AND a.id < b.id
--    AND a.status NOT IN ('cancelled', 'no_show')
--    AND b.status NOT IN ('cancelled', 'no_show')
--    AND a.start_time < b.end_time
--    AND b.start_time < a.end_time;
-- Se retornar linhas, resolva manualmente antes de confiar só no trigger
-- (o trigger bloqueia novos overlaps; não reescreve histórico).
-- ============================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Flag de agendamento público no Smart Hub (desligado por padrão)
-- ---------------------------------------------------------------------------
ALTER TABLE public.smart_hubs
  ADD COLUMN IF NOT EXISTS public_booking_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.smart_hubs.public_booking_enabled IS
  'Quando true e status=published, o Hub aceita consulta/confirmação via smart-hub-booking. Default false.';

-- ---------------------------------------------------------------------------
-- 2) Idempotência do booking público em appointments
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booking_idempotency_key text;

COMMENT ON COLUMN public.appointments.booking_idempotency_key IS
  'Chave de idempotência enviada pelo cliente no booking público (única por clínica).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_clinic_booking_idempotency
  ON public.appointments (clinic_id, booking_idempotency_key)
  WHERE booking_idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) Índices para disponibilidade
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_professional_date
  ON public.appointments (clinic_id, professional_id, date);

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_date_status
  ON public.appointments (clinic_id, date, status);

-- procedure_id pode já existir (PRODUCAO_09); índice idempotente
CREATE INDEX IF NOT EXISTS idx_appointments_procedure_id
  ON public.appointments (procedure_id);

-- ---------------------------------------------------------------------------
-- 4) patients.lead_source: permitir smart_hub (origem do booking)
-- ---------------------------------------------------------------------------
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_lead_source_check;
ALTER TABLE public.patients
  ADD CONSTRAINT patients_lead_source_check
  CHECK (
    lead_source IS NULL
    OR lead_source IN (
      'instagram', 'whatsapp', 'facebook', 'referral',
      'paid_traffic', 'other', 'smart_hub'
    )
  );

-- ---------------------------------------------------------------------------
-- 5) Trigger anti-overlap (status ativos) — segunda linha de defesa
--    cancelled / no_show não bloqueiam.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_appointment_time_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'no_show') THEN
    RETURN NEW;
  END IF;

  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'Horário final deve ser posterior ao inicial'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.clinic_id = NEW.clinic_id
      AND a.professional_id = NEW.professional_id
      AND a.date = NEW.date
      AND a.id IS DISTINCT FROM NEW.id
      AND a.status NOT IN ('cancelled', 'no_show')
      AND a.start_time < NEW.end_time
      AND NEW.start_time < a.end_time
  ) THEN
    RAISE EXCEPTION 'Conflito de horário: já existe agendamento ativo neste intervalo'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_appointment_time_overlap ON public.appointments;
CREATE TRIGGER trg_prevent_appointment_time_overlap
  BEFORE INSERT OR UPDATE OF clinic_id, professional_id, date, start_time, end_time, status
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_appointment_time_overlap();

-- ---------------------------------------------------------------------------
-- 6) RPC atômica: lock + idempotência + overlap + insert
--    Chamada apenas pela Edge Function (service role).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_smart_hub_booking_appointment(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_professional_id uuid,
  p_procedure text,
  p_procedure_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_notes text,
  p_idempotency_key text,
  p_lead_source text DEFAULT 'smart_hub'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.appointments%ROWTYPE;
  v_new_id uuid;
BEGIN
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'idempotency_key inválida' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Lock por clínica + profissional + data (evita corrida entre confirms)
  PERFORM pg_advisory_xact_lock(
    hashtext(p_clinic_id::text || ':' || p_professional_id::text),
    hashtext(p_date::text)
  );

  SELECT * INTO v_existing
  FROM public.appointments
  WHERE clinic_id = p_clinic_id
    AND booking_idempotency_key = p_idempotency_key
  LIMIT 1;

  IF FOUND THEN
    -- Mesma chave só é válida para o mesmo slot/procedimento/profissional.
    -- Paciente não entra no fingerprint (corrida de retry pode criar paciente extra).
    IF v_existing.professional_id IS DISTINCT FROM p_professional_id
       OR v_existing.date IS DISTINCT FROM p_date
       OR v_existing.start_time IS DISTINCT FROM p_start_time
       OR v_existing.end_time IS DISTINCT FROM p_end_time
       OR v_existing.procedure_id IS DISTINCT FROM p_procedure_id
    THEN
      RAISE EXCEPTION 'idempotency_conflict'
        USING ERRCODE = 'unique_violation';
    END IF;

    RETURN jsonb_build_object(
      'created', false,
      'idempotent', true,
      'appointment_id', v_existing.id,
      'patient_id', v_existing.patient_id,
      'status', v_existing.status,
      'date', v_existing.date,
      'start_time', v_existing.start_time,
      'end_time', v_existing.end_time,
      'professional_id', v_existing.professional_id,
      'procedure_id', v_existing.procedure_id
    );
  END IF;

  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'Horário final deve ser posterior ao inicial'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.clinic_id = p_clinic_id
      AND a.professional_id = p_professional_id
      AND a.date = p_date
      AND a.status NOT IN ('cancelled', 'no_show')
      AND a.start_time < p_end_time
      AND p_start_time < a.end_time
  ) THEN
    RAISE EXCEPTION 'slot_taken'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  INSERT INTO public.appointments (
    clinic_id,
    patient_id,
    professional_id,
    date,
    start_time,
    end_time,
    procedure,
    procedure_id,
    status,
    payment_status,
    notes,
    lead_source,
    booking_idempotency_key
  ) VALUES (
    p_clinic_id,
    p_patient_id,
    p_professional_id,
    p_date,
    p_start_time,
    p_end_time,
    p_procedure,
    p_procedure_id,
    'confirmed',
    'pending',
    p_notes,
    COALESCE(NULLIF(trim(p_lead_source), ''), 'smart_hub'),
    p_idempotency_key
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'created', true,
    'idempotent', false,
    'appointment_id', v_new_id,
    'patient_id', p_patient_id,
    'status', 'confirmed',
    'date', p_date,
    'start_time', p_start_time,
    'end_time', p_end_time,
    'professional_id', p_professional_id,
    'procedure_id', p_procedure_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.insert_smart_hub_booking_appointment(
  uuid, uuid, uuid, text, uuid, date, time, time, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.insert_smart_hub_booking_appointment(
  uuid, uuid, uuid, text, uuid, date, time, time, text, text, text
) TO service_role;

COMMENT ON FUNCTION public.insert_smart_hub_booking_appointment IS
  'Insert atômico de appointment do booking público (advisory lock + idempotência + overlap). Somente service_role.';

-- ---------------------------------------------------------------------------
-- 7) Localização de paciente por telefone normalizado (sem LIMIT 200 no app)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_patients_clinic_phone_digits
  ON public.patients (
    clinic_id,
    (regexp_replace(coalesce(phone, ''), '\D', '', 'g'))
  );

CREATE OR REPLACE FUNCTION public.find_clinic_patient_by_phone(
  p_clinic_id uuid,
  p_phone text
)
RETURNS TABLE (
  id uuid,
  name text,
  phone text,
  email text,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_tail text;
BEGIN
  IF length(v_digits) < 10 THEN
    RETURN;
  END IF;

  v_tail := right(v_digits, 10);

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.phone,
    p.email,
    p.status
  FROM public.patients p
  WHERE p.clinic_id = p_clinic_id
    AND (
      regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = v_digits
      OR (
        length(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')) >= 10
        AND right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10) = v_tail
      )
    )
  ORDER BY p.created_at ASC NULLS LAST, p.id ASC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.find_clinic_patient_by_phone(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_clinic_patient_by_phone(uuid, text) TO service_role;

COMMENT ON FUNCTION public.find_clinic_patient_by_phone IS
  'Localiza paciente da clínica por telefone normalizado (dígitos / últimos 10). Somente service_role.';

COMMIT;

NOTIFY pgrst, 'reload schema';

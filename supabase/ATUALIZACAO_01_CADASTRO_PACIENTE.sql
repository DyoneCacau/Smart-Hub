-- Atualização 01: agendamento online grava CPF, data de nascimento e convênio no cadastro do paciente.
-- Rode uma vez no SQL Editor do Supabase (pode rodar de novo sem problema).

CREATE OR REPLACE FUNCTION public.smart_hub_booking_confirm(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hub public.smart_hubs;
  v_key TEXT := NULLIF(trim(p_payload->>'idempotency_key'), '');
  v_name TEXT := NULLIF(trim(p_payload->'patient'->>'name'), '');
  v_phone_key TEXT := public.smart_hub_phone_key(p_payload->'patient'->>'phone');
  v_email TEXT := NULLIF(trim(p_payload->'patient'->>'email'), '');
  v_cpf TEXT := NULLIF(regexp_replace(COALESCE(p_payload->'patient'->>'cpf', ''), '\D', '', 'g'), '');
  v_cpf_fmt TEXT;
  v_birth DATE;
  v_insurance TEXT := left(NULLIF(trim(p_payload->'patient'->>'insurance'), ''), 120);
  v_notes TEXT := NULLIF(trim(p_payload->>'notes'), '');
  v_procedure_id UUID;
  v_professional_id UUID;
  v_date DATE;
  v_start TIME;
  v_proc public.procedures;
  v_prof public.professionals;
  v_existing public.appointments;
  v_slot_date DATE;
  v_slot_start TIME;
  v_slot_end TIME;
  v_patient_id UUID;
  v_patient_name TEXT;
  v_patient_phone TEXT;
  v_duplicate BOOLEAN := false;
  v_appointment_id UUID;
BEGIN
  v_hub := public.smart_hub_booking_target(p_payload->>'slug', true);
  IF v_hub.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'hub_not_found');
  END IF;
  IF NOT COALESCE(v_hub.public_booking_enabled, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'booking_disabled');
  END IF;
  IF p_payload->'privacy_accepted' IS DISTINCT FROM 'true'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'code', 'privacy_required');
  END IF;

  IF v_key IS NULL OR length(v_key) > 100
     OR v_name IS NULL OR length(v_name) > 120
     OR length(v_phone_key) NOT BETWEEN 10 AND 11
     OR (v_email IS NOT NULL AND (length(v_email) > 254 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
     OR (v_cpf IS NOT NULL AND length(v_cpf) <> 11)
     OR length(COALESCE(v_notes, '')) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
  END IF;

  BEGIN
    v_procedure_id := (p_payload->>'procedure_id')::UUID;
    v_professional_id := (p_payload->>'professional_id')::UUID;
    v_date := (p_payload->>'date')::DATE;
    v_start := (p_payload->>'start_time')::TIME;
    v_birth := NULLIF(p_payload->'patient'->>'birth_date', '')::DATE;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
  END;
  IF v_procedure_id IS NULL OR v_professional_id IS NULL OR v_date IS NULL OR v_start IS NULL
     OR (v_birth IS NOT NULL AND (v_birth > CURRENT_DATE OR v_birth < DATE '1900-01-01')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
  END IF;
  IF v_cpf IS NOT NULL THEN
    v_cpf_fmt := substr(v_cpf, 1, 3) || '.' || substr(v_cpf, 4, 3) || '.' || substr(v_cpf, 7, 3) || '-' || substr(v_cpf, 10, 2);
  END IF;

  -- Serializa reservas do mesmo profissional para não vender o mesmo horário duas vezes.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_hub.clinic_id::TEXT || ':' || v_professional_id::TEXT, 0));

  SELECT * INTO v_existing
  FROM public.appointments
  WHERE clinic_id = v_hub.clinic_id AND booking_idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'success', true,
      'appointment_id', v_existing.id,
      'status', v_existing.status,
      'patient_id', v_existing.patient_id,
      'duplicate_patient', true,
      'slot', jsonb_build_object(
        'date', v_existing.date,
        'start_time', to_char(v_existing.start_time, 'HH24:MI'),
        'end_time', to_char(v_existing.end_time, 'HH24:MI'),
        'professional_id', v_existing.professional_id
      )
    );
  END IF;

  IF (
    SELECT count(*) FROM public.appointments a
    WHERE a.clinic_id = v_hub.clinic_id
      AND a.booking_idempotency_key IS NOT NULL
      AND a.created_at > now() - interval '10 minutes'
  ) >= 30 OR (
    SELECT count(*) FROM public.appointments a
    WHERE a.clinic_id = v_hub.clinic_id
      AND a.booking_idempotency_key IS NOT NULL
      AND a.date = v_date
      AND a.status NOT IN ('cancelled', 'no_show')
      AND public.smart_hub_phone_key(a.patient_phone) = v_phone_key
  ) >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate_limited');
  END IF;

  SELECT * INTO v_proc
  FROM public.procedures
  WHERE id = v_procedure_id
    AND clinic_id = v_hub.clinic_id
    AND is_active
    AND duration_minutes BETWEEN 5 AND 720;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'procedure_not_found');
  END IF;

  SELECT * INTO v_prof
  FROM public.professionals
  WHERE id = v_professional_id AND clinic_id = v_hub.clinic_id AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'professional_not_found');
  END IF;

  SELECT s.slot_date, s.slot_start, s.slot_end
  INTO v_slot_date, v_slot_start, v_slot_end
  FROM public.smart_hub_available_slots(v_hub.clinic_id, v_prof.id, v_date, v_date, v_proc.duration_minutes) s
  WHERE s.slot_start = v_start;
  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM public.smart_hub_available_slots(v_hub.clinic_id, NULL, v_date, v_date, v_proc.duration_minutes) s
      WHERE s.slot_start = v_start
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'slot_taken');
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'outside_work_schedule');
  END IF;

  -- Paciente já cadastrado: procura pelo CPF e depois pelo telefone.
  IF v_cpf IS NOT NULL THEN
    SELECT p.id, p.name, p.phone
    INTO v_patient_id, v_patient_name, v_patient_phone
    FROM public.patients p
    WHERE p.clinic_id = v_hub.clinic_id
      AND regexp_replace(COALESCE(p.cpf, ''), '\D', '', 'g') = v_cpf
    ORDER BY (p.status = 'active') DESC, p.created_at
    LIMIT 1;
  END IF;
  IF v_patient_id IS NULL THEN
    SELECT p.id, p.name, p.phone
    INTO v_patient_id, v_patient_name, v_patient_phone
    FROM public.patients p
    WHERE p.clinic_id = v_hub.clinic_id
      AND public.smart_hub_phone_key(p.phone) = v_phone_key
    ORDER BY (p.status = 'active') DESC, p.created_at
    LIMIT 1;
  END IF;

  IF v_patient_id IS NOT NULL THEN
    v_duplicate := true;
    -- Visitante anônimo só completa campos vazios; nunca sobrescreve o cadastro da clínica.
    UPDATE public.patients SET
      cpf = COALESCE(NULLIF(cpf, ''), v_cpf_fmt),
      birth_date = COALESCE(birth_date, v_birth),
      email = COALESCE(NULLIF(email, ''), v_email),
      insurance = COALESCE(NULLIF(insurance, ''), v_insurance),
      phone = CASE WHEN COALESCE(phone, '') = '' THEN public.smart_hub_format_phone(v_phone_key) ELSE phone END
    WHERE id = v_patient_id
    RETURNING phone INTO v_patient_phone;
  ELSE
    INSERT INTO public.patients (clinic_id, name, phone, email, cpf, birth_date, insurance)
    VALUES (
      v_hub.clinic_id, v_name, public.smart_hub_format_phone(v_phone_key), v_email,
      v_cpf_fmt, v_birth, v_insurance
    )
    RETURNING id, name, phone INTO v_patient_id, v_patient_name, v_patient_phone;
  END IF;

  INSERT INTO public.appointments (
    clinic_id, date, start_time, end_time, patient_name, patient_phone, patient_id,
    professional_id, procedure_name, procedure_id, procedure_price, status, payment_status,
    notes, booking_idempotency_key
  ) VALUES (
    v_hub.clinic_id, v_slot_date, v_slot_start, v_slot_end, v_patient_name, v_patient_phone, v_patient_id,
    v_prof.id, v_proc.name, v_proc.id, v_proc.default_price, 'confirmed', 'pending',
    concat_ws(E'\n', v_notes, 'Agendamento online Smart Hub (' || v_hub.slug || ')'), v_key
  )
  RETURNING id INTO v_appointment_id;

  INSERT INTO public.smart_hub_events (clinic_id, hub_id, event_type, event_name, payload)
  VALUES (
    v_hub.clinic_id, v_hub.id, 'booking_confirmed', v_proc.name,
    jsonb_build_object(
      'appointment_id', v_appointment_id,
      'professional_name', v_prof.name,
      'date', v_slot_date,
      'start_time', to_char(v_slot_start, 'HH24:MI')
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'success', true,
    'appointment_id', v_appointment_id,
    'status', 'confirmed',
    'patient_id', v_patient_id,
    'duplicate_patient', v_duplicate,
    'slot', jsonb_build_object(
      'date', v_slot_date,
      'start_time', to_char(v_slot_start, 'HH24:MI'),
      'end_time', to_char(v_slot_end, 'HH24:MI'),
      'professional_id', v_prof.id
    )
  );
END;
$$;

NOTIFY pgrst, 'reload schema';

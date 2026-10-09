-- ============================================================================
-- ATUALIZAÇÃO 02 — WhatsApp automático via Suri
--
-- Rode no SQL Editor do Supabase (pode rodar mais de uma vez).
--
-- O SmartHub chama o webhook de gatilho de um fluxo da Suri:
--   * ao criar uma consulta (confirmação do agendamento);
--   * na véspera, a partir do horário configurado;
--   * no dia, X horas antes da consulta.
-- O fluxo da Suri responde chamando smart_hub_appointment_reply (confirmar,
-- cancelar ou pedir para remarcar) com o token enviado no webhook.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------------------------------------------------------------------------
-- Consultas: token público (vai para a Suri) e resposta do paciente
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS public_token UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS patient_reply TEXT
    CHECK (patient_reply IN ('confirmed', 'cancelled', 'reschedule')),
  ADD COLUMN IF NOT EXISTS patient_replied_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_public_token
  ON public.appointments(public_token);

-- ---------------------------------------------------------------------------
-- Configuração por clínica
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinic_whatsapp_settings (
  clinic_id UUID PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'suri' CHECK (provider IN ('suri')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  booking_enabled BOOLEAN NOT NULL DEFAULT true,
  booking_webhook_url TEXT
    CHECK (booking_webhook_url IS NULL OR booking_webhook_url ~ '^https://[^\s]+$'),
  day_before_enabled BOOLEAN NOT NULL DEFAULT true,
  day_before_time TIME NOT NULL DEFAULT '18:00',
  day_before_webhook_url TEXT
    CHECK (day_before_webhook_url IS NULL OR day_before_webhook_url ~ '^https://[^\s]+$'),
  same_day_enabled BOOLEAN NOT NULL DEFAULT false,
  same_day_hours_before INT NOT NULL DEFAULT 2 CHECK (same_day_hours_before BETWEEN 1 AND 12),
  same_day_webhook_url TEXT
    CHECK (same_day_webhook_url IS NULL OR same_day_webhook_url ~ '^https://[^\s]+$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_clinic_whatsapp_settings_updated_at ON public.clinic_whatsapp_settings;
CREATE TRIGGER trg_clinic_whatsapp_settings_updated_at
  BEFORE UPDATE ON public.clinic_whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.clinic_whatsapp_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic owner manages whatsapp settings" ON public.clinic_whatsapp_settings;
CREATE POLICY "Clinic owner manages whatsapp settings"
ON public.clinic_whatsapp_settings FOR ALL
USING (public.user_belongs_to_clinic(clinic_id))
WITH CHECK (public.user_belongs_to_clinic(clinic_id));

-- ---------------------------------------------------------------------------
-- Histórico de envios (um por consulta e tipo: nunca envia duas vezes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('booking', 'day_before', 'same_day', 'test')),
  phone TEXT NOT NULL,
  patient_name TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'error')),
  request_id BIGINT,
  http_status INT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_notifications_once
  ON public.whatsapp_notifications(appointment_id, kind)
  WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_clinic
  ON public.whatsapp_notifications(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_queued
  ON public.whatsapp_notifications(request_id)
  WHERE status = 'queued';

ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic owner views whatsapp notifications" ON public.whatsapp_notifications;
CREATE POLICY "Clinic owner views whatsapp notifications"
ON public.whatsapp_notifications FOR SELECT
USING (public.user_belongs_to_clinic(clinic_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_whatsapp_settings TO authenticated;
REVOKE ALL ON public.whatsapp_notifications FROM anon, authenticated;
GRANT SELECT ON public.whatsapp_notifications TO authenticated;

-- ---------------------------------------------------------------------------
-- Payload enviado à Suri (chaves planas: @Integrations.<id>.nome etc.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_appointment_payload(p_appointment_id UUID, p_kind TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'evento', p_kind,
    'teste', false,
    'telefone', '55' || public.smart_hub_phone_key(COALESCE(NULLIF(a.patient_phone, ''), pt.phone)),
    'nome', a.patient_name,
    'primeiro_nome', split_part(btrim(a.patient_name), ' ', 1),
    'data', to_char(a.date, 'DD/MM/YYYY'),
    'dia_semana', (ARRAY['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
                         'quinta-feira', 'sexta-feira', 'sábado'])[EXTRACT(DOW FROM a.date)::INT + 1],
    'horario', to_char(a.start_time, 'HH24:MI'),
    'horario_fim', to_char(a.end_time, 'HH24:MI'),
    'procedimento', a.procedure_name,
    'profissional', COALESCE(pr.name, ''),
    'clinica', c.name,
    'status', a.status,
    'token', a.public_token::TEXT
  )
  FROM public.appointments a
  JOIN public.clinics c ON c.id = a.clinic_id
  LEFT JOIN public.professionals pr ON pr.id = a.professional_id
  LEFT JOIN public.patients pt ON pt.id = a.patient_id
  WHERE a.id = p_appointment_id;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_webhook_url(
  p_settings public.clinic_whatsapp_settings,
  p_kind TEXT,
  p_ignore_toggles BOOLEAN DEFAULT false
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(btrim(CASE p_kind
    WHEN 'booking' THEN CASE WHEN p_ignore_toggles OR p_settings.booking_enabled THEN p_settings.booking_webhook_url END
    WHEN 'day_before' THEN CASE WHEN p_ignore_toggles OR p_settings.day_before_enabled THEN p_settings.day_before_webhook_url END
    WHEN 'same_day' THEN CASE WHEN p_ignore_toggles OR p_settings.same_day_enabled THEN p_settings.same_day_webhook_url END
  END), '');
$$;

-- Registra o envio e coloca a chamada HTTP na fila do pg_net.
CREATE OR REPLACE FUNCTION public.whatsapp_post(
  p_clinic_id UUID,
  p_appointment_id UUID,
  p_kind TEXT,
  p_url TEXT,
  p_payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_request BIGINT;
BEGIN
  IF length(COALESCE(p_payload->>'telefone', '')) NOT BETWEEN 12 AND 13 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.whatsapp_notifications (clinic_id, appointment_id, kind, phone, patient_name)
  VALUES (p_clinic_id, p_appointment_id, p_kind, p_payload->>'telefone', p_payload->>'nome')
  ON CONFLICT (appointment_id, kind) WHERE appointment_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    SELECT net.http_post(
      url := p_url,
      body := p_payload,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 15000
    ) INTO v_request;
    UPDATE public.whatsapp_notifications SET request_id = v_request WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.whatsapp_notifications
    SET status = 'error', error = left(SQLERRM, 300), updated_at = now()
    WHERE id = v_id;
  END;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_dispatch(p_appointment_id UUID, p_kind TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.clinic_whatsapp_settings%ROWTYPE;
  v_clinic_id UUID;
  v_url TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM public.appointments WHERE id = p_appointment_id;
  IF v_clinic_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_settings
  FROM public.clinic_whatsapp_settings
  WHERE clinic_id = v_clinic_id AND is_active;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_url := public.whatsapp_webhook_url(v_settings, p_kind);
  IF v_url IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN public.whatsapp_post(
    v_clinic_id,
    p_appointment_id,
    p_kind,
    v_url,
    public.whatsapp_appointment_payload(p_appointment_id, p_kind)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos na tabela de consultas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_on_appointment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local_now TIMESTAMP;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Consulta remarcada: os lembretes valem para a nova data.
    IF (NEW.date, NEW.start_time) IS DISTINCT FROM (OLD.date, OLD.start_time) THEN
      DELETE FROM public.whatsapp_notifications
      WHERE appointment_id = NEW.id AND kind IN ('day_before', 'same_day');
    END IF;
    RETURN NEW;
  END IF;

  SELECT now() AT TIME ZONE c.timezone INTO v_local_now
  FROM public.clinics c WHERE c.id = NEW.clinic_id;

  IF NEW.status IN ('pending', 'confirmed', 'return')
     AND (NEW.date + NEW.start_time) > v_local_now THEN
    PERFORM public.whatsapp_dispatch(NEW.id, 'booking');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Falha no envio nunca pode impedir o agendamento.
  RAISE WARNING 'whatsapp_on_appointment_change: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_whatsapp ON public.appointments;
CREATE TRIGGER trg_appointments_whatsapp
  AFTER INSERT OR UPDATE OF date, start_time ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_on_appointment_change();

-- ---------------------------------------------------------------------------
-- Respostas do pg_net → status do envio
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_sync_responses()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  BEGIN
    UPDATE public.whatsapp_notifications w
    SET status = CASE WHEN r.status_code BETWEEN 200 AND 299 THEN 'sent' ELSE 'error' END,
        http_status = r.status_code,
        error = CASE
          WHEN r.status_code BETWEEN 200 AND 299 THEN NULL
          WHEN r.timed_out THEN 'A Suri não respondeu a tempo.'
          ELSE left(COALESCE(NULLIF(r.error_msg, ''), r.content, 'Erro HTTP ' || r.status_code), 300)
        END,
        updated_at = now()
    FROM net._http_response r
    WHERE w.status = 'queued' AND w.request_id = r.id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'whatsapp_sync_responses: %', SQLERRM;
  END;

  UPDATE public.whatsapp_notifications
  SET status = 'error', error = 'Sem resposta da Suri.', updated_at = now()
  WHERE status = 'queued' AND created_at < now() - INTERVAL '30 minutes';

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Lembretes (roda a cada 5 minutos pelo pg_cron)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_dispatch_due()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_sent INT := 0;
BEGIN
  PERFORM public.whatsapp_sync_responses();

  FOR r IN
    SELECT a.id, 'day_before'::TEXT AS kind
    FROM public.appointments a
    JOIN public.clinics c ON c.id = a.clinic_id
    JOIN public.clinic_whatsapp_settings s ON s.clinic_id = a.clinic_id
    CROSS JOIN LATERAL (SELECT now() AT TIME ZONE c.timezone AS local_now) t
    WHERE s.is_active
      AND s.day_before_enabled
      AND COALESCE(btrim(s.day_before_webhook_url), '') <> ''
      AND a.status IN ('pending', 'confirmed', 'return')
      AND a.date = t.local_now::DATE + 1
      AND t.local_now::TIME >= s.day_before_time
      -- Agendou depois do horário do lembrete: a confirmação já basta.
      AND (a.created_at AT TIME ZONE c.timezone) < ((a.date - 1) + s.day_before_time)
      AND NOT EXISTS (
        SELECT 1 FROM public.whatsapp_notifications w
        WHERE w.appointment_id = a.id AND w.kind = 'day_before'
      )
    UNION ALL
    SELECT a.id, 'same_day'::TEXT
    FROM public.appointments a
    JOIN public.clinics c ON c.id = a.clinic_id
    JOIN public.clinic_whatsapp_settings s ON s.clinic_id = a.clinic_id
    CROSS JOIN LATERAL (SELECT now() AT TIME ZONE c.timezone AS local_now) t
    WHERE s.is_active
      AND s.same_day_enabled
      AND COALESCE(btrim(s.same_day_webhook_url), '') <> ''
      AND a.status IN ('pending', 'confirmed', 'return')
      AND a.date = t.local_now::DATE
      AND t.local_now >= (a.date + a.start_time) - make_interval(hours => s.same_day_hours_before)
      AND t.local_now < (a.date + a.start_time)
      AND (a.created_at AT TIME ZONE c.timezone)
          < (a.date + a.start_time) - make_interval(hours => s.same_day_hours_before)
      AND NOT EXISTS (
        SELECT 1 FROM public.whatsapp_notifications w
        WHERE w.appointment_id = a.id AND w.kind = 'same_day'
      )
  LOOP
    IF public.whatsapp_dispatch(r.id, r.kind) IS NOT NULL THEN
      v_sent := v_sent + 1;
    END IF;
  END LOOP;

  RETURN v_sent;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'smarthub-whatsapp-lembretes') THEN
    PERFORM cron.unschedule('smarthub-whatsapp-lembretes');
  END IF;
  PERFORM cron.schedule(
    'smarthub-whatsapp-lembretes',
    '*/5 * * * *',
    'SELECT public.whatsapp_dispatch_due()'
  );
END $$;

-- ---------------------------------------------------------------------------
-- Resposta do paciente (chamada pela "Requisição HTTP" do fluxo da Suri)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smart_hub_appointment_reply(p_token TEXT, p_action TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token UUID;
  v_action TEXT := lower(btrim(COALESCE(p_action, '')));
  v_appt public.appointments%ROWTYPE;
  v_local_now TIMESTAMP;
  v_when TEXT;
BEGIN
  BEGIN
    v_token := btrim(p_token)::UUID;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'token_invalido',
      'mensagem', 'Não encontramos esta consulta.');
  END;

  v_action := CASE
    WHEN v_action IN ('confirm', 'confirmar', 'confirmado', 'sim') THEN 'confirm'
    WHEN v_action IN ('cancel', 'cancelar', 'cancelado', 'nao', 'não') THEN 'cancel'
    WHEN v_action IN ('reschedule', 'remarcar', 'reagendar') THEN 'reschedule'
    ELSE NULL
  END;
  IF v_action IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'acao_invalida',
      'mensagem', 'Use confirmar, cancelar ou remarcar.');
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE public_token = v_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'token_invalido',
      'mensagem', 'Não encontramos esta consulta.');
  END IF;

  SELECT now() AT TIME ZONE c.timezone INTO v_local_now
  FROM public.clinics c WHERE c.id = v_appt.clinic_id;
  v_when := to_char(v_appt.date, 'DD/MM') || ' às ' || to_char(v_appt.start_time, 'HH24:MI');

  IF (v_appt.date + v_appt.start_time) <= v_local_now
     OR v_appt.status IN ('completed', 'no_show') THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'consulta_passada',
      'mensagem', 'Esta consulta já aconteceu. Fale com a clínica se precisar de ajuda.');
  END IF;

  IF v_appt.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'consulta_cancelada',
      'mensagem', 'Esta consulta já está cancelada. Fale com a clínica para agendar novamente.');
  END IF;

  IF v_action = 'confirm' THEN
    UPDATE public.appointments
    SET status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
        patient_reply = 'confirmed', patient_replied_at = now()
    WHERE id = v_appt.id;
    RETURN jsonb_build_object('ok', true, 'codigo', 'confirmada', 'status', 'confirmed',
      'mensagem', 'Consulta confirmada! Te esperamos em ' || v_when || '.');
  END IF;

  IF v_action = 'cancel' THEN
    UPDATE public.appointments
    SET status = 'cancelled', patient_reply = 'cancelled', patient_replied_at = now()
    WHERE id = v_appt.id;
    RETURN jsonb_build_object('ok', true, 'codigo', 'cancelada', 'status', 'cancelled',
      'mensagem', 'Consulta de ' || v_when || ' cancelada.');
  END IF;

  UPDATE public.appointments
  SET patient_reply = 'reschedule', patient_replied_at = now(),
      notes = concat_ws(E'\n', NULLIF(btrim(notes), ''),
        'Paciente pediu para remarcar pelo WhatsApp em '
        || to_char(v_local_now, 'DD/MM/YYYY HH24:MI') || '.')
  WHERE id = v_appt.id;
  RETURN jsonb_build_object('ok', true, 'codigo', 'remarcar', 'status', v_appt.status,
    'mensagem', 'Pedido de remarcação recebido. A clínica vai falar com você.');
END;
$$;

-- ---------------------------------------------------------------------------
-- Envio de teste (tela WhatsApp do app)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_send_test(p_clinic_id UUID, p_kind TEXT, p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.clinic_whatsapp_settings%ROWTYPE;
  v_url TEXT;
  v_phone TEXT := public.smart_hub_phone_key(p_phone);
  v_clinic_name TEXT;
  v_tomorrow DATE;
  v_id UUID;
BEGIN
  IF NOT public.user_belongs_to_clinic(p_clinic_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta clínica.' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('booking', 'day_before', 'same_day') THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', 'Tipo de mensagem inválido.');
  END IF;
  IF length(v_phone) NOT BETWEEN 10 AND 11 THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', 'Informe um telefone com DDD.');
  END IF;

  SELECT * INTO v_settings FROM public.clinic_whatsapp_settings WHERE clinic_id = p_clinic_id;
  v_url := CASE WHEN FOUND THEN public.whatsapp_webhook_url(v_settings, p_kind, true) END;
  IF v_url IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', 'Salve a URL do webhook desta mensagem antes de testar.');
  END IF;

  IF (SELECT count(*) FROM public.whatsapp_notifications
      WHERE clinic_id = p_clinic_id AND kind = 'test'
        AND created_at > now() - INTERVAL '1 hour') >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', 'Limite de 10 testes por hora atingido.');
  END IF;

  SELECT c.name, (now() AT TIME ZONE c.timezone)::DATE + 1
  INTO v_clinic_name, v_tomorrow
  FROM public.clinics c WHERE c.id = p_clinic_id;

  v_id := public.whatsapp_post(
    p_clinic_id,
    NULL,
    'test',
    v_url,
    jsonb_build_object(
      'evento', p_kind,
      'teste', true,
      'telefone', '55' || v_phone,
      'nome', 'Paciente Teste',
      'primeiro_nome', 'Paciente',
      'data', to_char(v_tomorrow, 'DD/MM/YYYY'),
      'dia_semana', (ARRAY['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
                           'quinta-feira', 'sexta-feira', 'sábado'])[EXTRACT(DOW FROM v_tomorrow)::INT + 1],
      'horario', '09:00',
      'horario_fim', '09:30',
      'procedimento', 'Consulta',
      'profissional', 'Profissional de teste',
      'clinica', COALESCE(v_clinic_name, ''),
      'status', 'pending',
      'token', '00000000-0000-0000-0000-000000000000'
    )
  );

  RETURN jsonb_build_object('ok', v_id IS NOT NULL, 'id', v_id,
    'mensagem', CASE WHEN v_id IS NULL THEN 'Não foi possível enviar o teste.' ELSE 'Teste enviado para a Suri.' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_refresh_status()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.whatsapp_sync_responses();
$$;

REVOKE ALL ON FUNCTION public.whatsapp_appointment_payload(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_post(UUID, UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_dispatch(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_sync_responses() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_dispatch_due() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_on_appointment_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_send_test(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.whatsapp_refresh_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.smart_hub_appointment_reply(TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.whatsapp_send_test(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_refresh_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.smart_hub_appointment_reply(TEXT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

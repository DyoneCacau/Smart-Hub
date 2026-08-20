-- ============================================================================
-- PRODUÇÃO 02 — BILLING ASAAS
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Revise este arquivo e faça backup antes de executar.
-- 2. Execute MANUALMENTE no SQL Editor do painel Supabase.
-- 3. Não use a CLI para aplicar este arquivo automaticamente.
-- 4. O script é idempotente e pode ser executado novamente.
-- 5. Depois, configure os secrets e publique as Edge Functions conforme
--    supabase/functions/ASAAS_README.md.
-- ============================================================================

BEGIN;

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS asaas_customer_id text;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS monthly_fee numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS setup_fee numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS features_override jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text,
  ADD COLUMN IF NOT EXISTS asaas_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS asaas_next_due_date date;

-- Substitui qualquer CHECK ligado diretamente a subscriptions.status.
-- O conjunto abaixo reflete todos os estados usados atualmente pela aplicação.
DO $$
DECLARE
  v_constraint record;
BEGIN
  FOR v_constraint IN
    SELECT DISTINCT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.subscriptions'::regclass
      AND c.contype = 'c'
      AND a.attname = 'status'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.subscriptions DROP CONSTRAINT %I',
      v_constraint.conname
    );
  END LOOP;

  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN (
      'trial', 'pending', 'active', 'suspended',
      'blocked', 'cancelled', 'expired'
    ));
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND conname = 'subscriptions_billing_mode_check'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_billing_mode_check
      CHECK (billing_mode IN ('manual', 'asaas'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND conname = 'subscriptions_billing_status_asaas_check'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_billing_status_asaas_check
      CHECK (billing_status IN ('paid', 'pending', 'overdue'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS clinics_asaas_customer_id_uidx
  ON public.clinics (asaas_customer_id)
  WHERE asaas_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_asaas_subscription_id_uidx
  ON public.subscriptions (asaas_subscription_id)
  WHERE asaas_subscription_id IS NOT NULL;

ALTER TABLE public.payment_history
  ADD COLUMN IF NOT EXISTS asaas_payment_id text,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text,
  ADD COLUMN IF NOT EXISTS asaas_status text,
  ADD COLUMN IF NOT EXISTS charge_kind text NOT NULL DEFAULT 'recurring',
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS invoice_url text,
  ADD COLUMN IF NOT EXISTS bank_slip_url text,
  ADD COLUMN IF NOT EXISTS external_reference text,
  ADD COLUMN IF NOT EXISTS billing_type text,
  ADD COLUMN IF NOT EXISTS provider_payload jsonb,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS paid_at date,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.payment_history ALTER COLUMN paid_at DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payment_history'::regclass
      AND conname = 'payment_history_charge_kind_check'
  ) THEN
    ALTER TABLE public.payment_history
      ADD CONSTRAINT payment_history_charge_kind_check
      CHECK (charge_kind IN ('recurring', 'setup_fee'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS payment_history_asaas_payment_id_uidx
  ON public.payment_history (asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_history_asaas_subscription_idx
  ON public.payment_history (asaas_subscription_id);

CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
  event_id text PRIMARY KEY,
  provider text NOT NULL DEFAULT 'asaas',
  event_type text NOT NULL,
  payment_id text,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_attempts integer NOT NULL DEFAULT 0,
  last_error text,
  CONSTRAINT billing_webhook_events_provider_check CHECK (provider = 'asaas'),
  CONSTRAINT billing_webhook_events_event_id_check CHECK (length(event_id) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS billing_webhook_events_pending_idx
  ON public.billing_webhook_events (received_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_webhook_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages billing webhook events"
  ON public.billing_webhook_events;
CREATE POLICY "Service role manages billing webhook events"
  ON public.billing_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.asaas_store_billing_binding(
  p_subscription_id uuid,
  p_customer_id text,
  p_asaas_subscription_id text,
  p_next_due_date date DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  SELECT clinic_id INTO v_clinic_id
  FROM public.subscriptions
  WHERE id = p_subscription_id
  FOR UPDATE;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'subscription_not_found';
  END IF;

  UPDATE public.clinics
  SET asaas_customer_id = p_customer_id,
      updated_at = now()
  WHERE id = v_clinic_id;

  UPDATE public.subscriptions
  SET billing_mode = 'asaas',
      payment_provider = 'asaas',
      asaas_subscription_id = p_asaas_subscription_id,
      asaas_next_due_date = COALESCE(p_next_due_date, asaas_next_due_date),
      asaas_last_synced_at = now(),
      updated_at = now()
  WHERE id = p_subscription_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.asaas_persist_webhook_event(
  p_event_id text,
  p_event_type text,
  p_payload jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_count bigint;
BEGIN
  INSERT INTO public.billing_webhook_events (
    event_id, event_type, payment_id, payload
  ) VALUES (
    p_event_id,
    p_event_type,
    p_payload #>> '{payment,id}',
    p_payload
  )
  ON CONFLICT (event_id) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.asaas_apply_payment_event(
  p_event_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.billing_webhook_events%ROWTYPE;
  v_payment jsonb;
  v_payment_id text;
  v_asaas_subscription_id text;
  v_external_reference text;
  v_subscription_id uuid;
  v_status text;
  v_local_status text;
  v_billing_status text;
  v_amount numeric(10,2);
  v_paid_at date;
  v_is_setup_fee boolean;
BEGIN
  SELECT * INTO v_event
  FROM public.billing_webhook_events
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  IF v_event.processed_at IS NOT NULL THEN
    RETURN jsonb_build_object('processed', true, 'duplicate', true);
  END IF;

  UPDATE public.billing_webhook_events
  SET processing_attempts = processing_attempts + 1,
      last_error = NULL
  WHERE event_id = p_event_id;

  v_payment := v_event.payload -> 'payment';
  v_payment_id := v_payment ->> 'id';
  v_asaas_subscription_id := v_payment ->> 'subscription';
  v_external_reference := v_payment ->> 'externalReference';
  v_is_setup_fee := COALESCE(v_external_reference LIKE '%:setup_fee', false);
  v_status := COALESCE(v_payment ->> 'status', replace(v_event.event_type, 'PAYMENT_', ''));
  v_amount := COALESCE(NULLIF(v_payment ->> 'value', '')::numeric, 0);
  v_paid_at := COALESCE(
    NULLIF(v_payment ->> 'paymentDate', '')::date,
    NULLIF(v_payment ->> 'clientPaymentDate', '')::date
  );

  IF v_payment_id IS NULL THEN
    UPDATE public.billing_webhook_events
    SET processed_at = now(), last_error = 'Evento sem payment.id; ignorado'
    WHERE event_id = p_event_id;
    RETURN jsonb_build_object('processed', true, 'ignored', true);
  END IF;

  SELECT id INTO v_subscription_id
  FROM public.subscriptions
  WHERE (v_asaas_subscription_id IS NOT NULL
         AND asaas_subscription_id = v_asaas_subscription_id)
     OR (v_external_reference IS NOT NULL
         AND id::text = split_part(v_external_reference, ':', 1))
  ORDER BY (asaas_subscription_id = v_asaas_subscription_id) DESC
  LIMIT 1
  FOR UPDATE;

  IF v_subscription_id IS NULL THEN
    RAISE EXCEPTION 'subscription_binding_not_found';
  END IF;

  v_local_status := CASE
    WHEN v_status IN ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH') THEN 'confirmed'
    WHEN v_status IN ('REFUNDED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE',
                      'AWAITING_CHARGEBACK_REVERSAL', 'DUNNING_RECEIVED') THEN 'rejected'
    ELSE 'pending'
  END;

  v_billing_status := CASE
    WHEN v_status IN ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH') THEN 'paid'
    -- Regra conservadora: atraso, estorno e chargeback marcam a cobrança como
    -- overdue, mas não suspendem imediatamente a assinatura. O job
    -- check-subscriptions aplica a tolerância de 7 dias antes da suspensão.
    WHEN v_status IN ('OVERDUE', 'DUNNING_REQUESTED', 'REFUNDED',
                      'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE',
                      'AWAITING_CHARGEBACK_REVERSAL') THEN 'overdue'
    ELSE 'pending'
  END;

  INSERT INTO public.payment_history (
    subscription_id, amount, payment_method, status, confirmed_at, paid_at,
    description, asaas_payment_id, asaas_subscription_id, asaas_status,
    charge_kind, due_date, invoice_url, bank_slip_url, external_reference,
    billing_type, provider_payload, updated_at
  ) VALUES (
    v_subscription_id, v_amount, v_payment ->> 'billingType', v_local_status,
    CASE WHEN v_local_status = 'confirmed' THEN now() ELSE NULL END,
    v_paid_at,
    CASE WHEN v_is_setup_fee THEN 'Taxa de adesão Asaas'
         ELSE 'Mensalidade Asaas' END,
    v_payment_id, v_asaas_subscription_id, v_status,
    CASE WHEN v_is_setup_fee THEN 'setup_fee'
         ELSE 'recurring' END,
    NULLIF(v_payment ->> 'dueDate', '')::date,
    v_payment ->> 'invoiceUrl', v_payment ->> 'bankSlipUrl',
    v_external_reference, v_payment ->> 'billingType', v_payment, now()
  )
  ON CONFLICT (asaas_payment_id) WHERE asaas_payment_id IS NOT NULL
  DO UPDATE SET
    amount = EXCLUDED.amount,
    payment_method = EXCLUDED.payment_method,
    status = EXCLUDED.status,
    confirmed_at = COALESCE(public.payment_history.confirmed_at, EXCLUDED.confirmed_at),
    paid_at = COALESCE(EXCLUDED.paid_at, public.payment_history.paid_at),
    asaas_status = EXCLUDED.asaas_status,
    due_date = EXCLUDED.due_date,
    invoice_url = EXCLUDED.invoice_url,
    bank_slip_url = EXCLUDED.bank_slip_url,
    billing_type = EXCLUDED.billing_type,
    provider_payload = EXCLUDED.provider_payload,
    updated_at = now();

  IF v_is_setup_fee THEN
    -- A taxa de adesão é independente da mensalidade e nunca libera,
    -- suspende ou renova o acesso da clínica.
    UPDATE public.subscriptions
    SET asaas_last_synced_at = now(),
        updated_at = now()
    WHERE id = v_subscription_id;
  ELSE
    UPDATE public.subscriptions
    SET billing_mode = 'asaas',
        payment_provider = 'asaas',
        payment_status = CASE
          WHEN v_billing_status = 'paid' THEN 'paid'
          WHEN v_billing_status = 'overdue' THEN 'overdue'
          ELSE 'pending'
        END,
        billing_status = v_billing_status,
        status = CASE
          WHEN v_billing_status = 'paid' THEN 'active'
          ELSE status
        END,
        last_payment_at = CASE
          WHEN v_billing_status = 'paid' THEN COALESCE(v_paid_at::timestamptz, now())
          ELSE last_payment_at
        END,
        current_period_start = CASE
          WHEN v_billing_status = 'paid' THEN COALESCE(
            NULLIF(v_payment ->> 'dueDate', '')::date::timestamptz,
            v_paid_at::timestamptz,
            now()
          )
          ELSE current_period_start
        END,
        current_period_end = CASE
          WHEN v_billing_status = 'paid'
            THEN COALESCE(
              NULLIF(v_payment ->> 'dueDate', '')::date::timestamptz,
              v_paid_at::timestamptz,
              now()
            ) + interval '1 month'
          ELSE current_period_end
        END,
        asaas_next_due_date = CASE
          WHEN v_billing_status = 'paid'
            THEN (
              COALESCE(
                NULLIF(v_payment ->> 'dueDate', '')::date::timestamptz,
                v_paid_at::timestamptz,
                now()
              ) + interval '1 month'
            )::date
          ELSE NULLIF(v_payment ->> 'dueDate', '')::date
        END,
        asaas_last_synced_at = now(),
        updated_at = now()
    WHERE id = v_subscription_id;
  END IF;

  UPDATE public.billing_webhook_events
  SET processed_at = now(), last_error = NULL
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object(
    'processed', true,
    'subscription_id', v_subscription_id,
    'payment_id', v_payment_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.asaas_mark_event_error(
  p_event_id text,
  p_error text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.billing_webhook_events
  SET processing_attempts = processing_attempts + 1,
      last_error = left(COALESCE(p_error, 'processing_error'), 500)
  WHERE event_id = p_event_id;
$$;

CREATE OR REPLACE FUNCTION public.asaas_mark_subscription_cancelled(
  p_subscription_id uuid
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.subscriptions
  SET status = 'cancelled',
      billing_status = 'pending',
      payment_status = 'pending',
      asaas_last_synced_at = now(),
      updated_at = now()
  WHERE id = p_subscription_id;
$$;

REVOKE ALL ON FUNCTION public.asaas_store_billing_binding(uuid, text, text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.asaas_persist_webhook_event(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.asaas_apply_payment_event(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.asaas_mark_event_error(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.asaas_mark_subscription_cancelled(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.asaas_store_billing_binding(uuid, text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.asaas_persist_webhook_event(text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.asaas_apply_payment_event(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.asaas_mark_event_error(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.asaas_mark_subscription_cancelled(uuid) TO service_role;

COMMIT;

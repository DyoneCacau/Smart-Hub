-- ============================================================================
-- PRODUÇÃO 05 — DIA DE VENCIMENTO + PRÓ-RATA
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Revise este arquivo e faça backup antes de executar.
-- 2. Execute MANUALMENTE no SQL Editor do painel Supabase.
-- 3. Não use a CLI para aplicar este arquivo automaticamente.
-- 4. O script é idempotente e pode ser executado novamente.
-- 5. Depois, publique a Edge Function asaas-create-checkout atualizada.
-- ============================================================================

BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_day integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS proration_days integer,
  ADD COLUMN IF NOT EXISTS proration_amount numeric(10,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND conname = 'subscriptions_billing_day_check'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_billing_day_check
      CHECK (billing_day BETWEEN 1 AND 28);
  END IF;
END $$;

COMMENT ON COLUMN public.subscriptions.billing_day IS
  'Dia do mês (1-28) para vencimento da mensalidade recorrente Asaas';
COMMENT ON COLUMN public.subscriptions.proration_days IS
  'Dias cobrados no proporcional da adesão (stub até o 1º vencimento)';
COMMENT ON COLUMN public.subscriptions.proration_amount IS
  'Valor do proporcional da adesão (mensalidade * dias / 30)';

-- Amplia charge_kind para incluir pró-rata
ALTER TABLE public.payment_history
  DROP CONSTRAINT IF EXISTS payment_history_charge_kind_check;

ALTER TABLE public.payment_history
  ADD CONSTRAINT payment_history_charge_kind_check
  CHECK (charge_kind IN ('recurring', 'setup_fee', 'proration'));

-- Webhook: trata pró-rata (ativa acesso até o 1º vencimento, sem avançar ciclo mensal)
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
  v_is_proration boolean;
  v_existing_next_due date;
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
  v_is_proration := COALESCE(v_external_reference LIKE '%:proration', false);
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

  SELECT id, asaas_next_due_date
    INTO v_subscription_id, v_existing_next_due
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
    CASE
      WHEN v_is_setup_fee THEN 'Taxa de adesão Asaas'
      WHEN v_is_proration THEN 'Período proporcional Asaas'
      ELSE 'Mensalidade Asaas'
    END,
    v_payment_id, v_asaas_subscription_id, v_status,
    CASE
      WHEN v_is_setup_fee THEN 'setup_fee'
      WHEN v_is_proration THEN 'proration'
      ELSE 'recurring'
    END,
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
    UPDATE public.subscriptions
    SET asaas_last_synced_at = now(),
        updated_at = now()
    WHERE id = v_subscription_id;
  ELSIF v_is_proration THEN
    -- Pró-rata libera acesso até o 1º vencimento já gravado; não avança o ciclo.
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
          WHEN v_billing_status = 'paid' THEN COALESCE(v_paid_at::timestamptz, now())
          ELSE current_period_start
        END,
        current_period_end = CASE
          WHEN v_billing_status = 'paid'
            THEN COALESCE(v_existing_next_due, NULLIF(v_payment ->> 'dueDate', '')::date)::timestamptz
          ELSE current_period_end
        END,
        asaas_next_due_date = COALESCE(v_existing_next_due, asaas_next_due_date),
        asaas_last_synced_at = now(),
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

COMMIT;

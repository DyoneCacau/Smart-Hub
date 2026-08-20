-- ============================================================================
-- Migration: Ajustar register_payment para definir período e last_payment_at
-- Garante que ao registrar pagamento, current_period_end seja definido corretamente
-- para o check-subscriptions funcionar.
-- ============================================================================

CREATE OR REPLACE FUNCTION register_payment(
  p_subscription_id UUID,
  p_amount DECIMAL,
  p_paid_at DATE,
  p_payment_method TEXT DEFAULT 'pix',
  p_description TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_next_due_date DATE DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_payment_id UUID;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
BEGIN
  -- Inserir pagamento
  INSERT INTO payment_history (
    subscription_id,
    amount,
    paid_at,
    payment_method,
    description,
    created_by
  ) VALUES (
    p_subscription_id,
    p_amount,
    p_paid_at,
    p_payment_method,
    p_description,
    COALESCE(p_created_by, auth.uid())
  ) RETURNING id INTO v_payment_id;
  
  -- Período: início = data do pagamento; fim = p_next_due_date se informado, senão +30 dias
  v_period_start := (p_paid_at AT TIME ZONE 'UTC')::TIMESTAMPTZ;
  v_period_end := COALESCE(
    (p_next_due_date AT TIME ZONE 'UTC')::TIMESTAMPTZ,
    v_period_start + INTERVAL '30 days'
  );
  
  -- Atualizar assinatura: status, período e datas de pagamento
  UPDATE subscriptions
  SET 
    billing_status = 'paid',
    payment_status = 'paid',
    status = 'active',
    current_period_start = v_period_start,
    current_period_end = v_period_end,
    last_payment_at = v_period_start,
    updated_at = NOW()
  WHERE id = p_subscription_id;
  
  RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION register_payment IS 
'Registra um pagamento, atualiza status e define período de 30 dias a partir da data do pagamento';

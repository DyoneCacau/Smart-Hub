-- ============================================================================
-- Criar função register_payment (e update_billing_status) no SQL Editor
-- Use se "Registrar Pagamento" no Dashboard der erro de função não encontrada.
-- ============================================================================
-- Antes: garanta que subscriptions tem billing_status e payment_history tem paid_at.
-- Se não tiver, rode a migration 20260212_vendas_diretas.sql completa primeiro.
-- ============================================================================

-- 1) Coluna billing_status em subscriptions (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'billing_status') THEN
    ALTER TABLE subscriptions ADD COLUMN billing_status TEXT CHECK (billing_status IN ('paid', 'pending', 'overdue')) DEFAULT 'pending';
  END IF;
END $$;

-- 2) Função update_billing_status
CREATE OR REPLACE FUNCTION update_billing_status(p_subscription_id UUID, p_new_status TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE subscriptions SET billing_status = p_new_status, updated_at = NOW() WHERE id = p_subscription_id;
  IF p_new_status = 'paid' THEN
    UPDATE subscriptions SET status = 'active' WHERE id = p_subscription_id;
  END IF;
  IF p_new_status = 'overdue' THEN
    UPDATE subscriptions SET status = 'suspended' WHERE id = p_subscription_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) Coluna paid_at em payment_history (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_history' AND column_name = 'paid_at') THEN
    ALTER TABLE payment_history ADD COLUMN paid_at DATE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
    UPDATE payment_history SET paid_at = (created_at AT TIME ZONE 'UTC')::date WHERE paid_at IS NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_history' AND column_name = 'description') THEN
    ALTER TABLE payment_history ADD COLUMN description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_history' AND column_name = 'created_by') THEN
    ALTER TABLE payment_history ADD COLUMN created_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- 4) Função register_payment
CREATE OR REPLACE FUNCTION register_payment(
  p_subscription_id UUID,
  p_amount DECIMAL,
  p_paid_at DATE,
  p_payment_method TEXT DEFAULT 'pix',
  p_description TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_payment_id UUID;
BEGIN
  INSERT INTO payment_history (subscription_id, amount, paid_at, payment_method, description, created_by)
  VALUES (p_subscription_id, p_amount, p_paid_at, p_payment_method, p_description, COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_payment_id;
  PERFORM update_billing_status(p_subscription_id, 'paid');
  RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

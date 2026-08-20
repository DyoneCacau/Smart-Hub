-- ============================================================================
-- MIGRAÇÃO: Self-Service → Vendas Diretas B2B
-- Script SQL para Supabase (VERSÃO CORRIGIDA)
-- ============================================================================

-- PASSO 1: ADICIONAR CAMPOS NA TABELA SUBSCRIPTIONS
-- ============================================================================

-- Adicionar campo de status de cobrança
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'billing_status'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN billing_status TEXT 
    CHECK (billing_status IN ('paid', 'pending', 'overdue')) 
    DEFAULT 'pending';
    
    COMMENT ON COLUMN subscriptions.billing_status IS 
    'Status de pagamento manual: paid (pago), pending (aguardando), overdue (atrasado)';
  END IF;
END $$;

-- Adicionar campos de valores
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'monthly_fee'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN monthly_fee DECIMAL(10,2) DEFAULT 0;
    COMMENT ON COLUMN subscriptions.monthly_fee IS 'Valor da mensalidade';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'setup_fee'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN setup_fee DECIMAL(10,2) DEFAULT 0;
    COMMENT ON COLUMN subscriptions.setup_fee IS 'Valor da adesão (one-time)';
  END IF;
END $$;

-- Adicionar campo de notas administrativas
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'admin_notes'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN admin_notes TEXT;
    COMMENT ON COLUMN subscriptions.admin_notes IS 
    'Notas internas sobre o cliente (não visível para o cliente)';
  END IF;
END $$;

-- PASSO 2: CRIAR TABELA DE HISTÓRICO DE PAGAMENTOS (ou compatibilizar com tabela existente)
-- ============================================================================
-- A tabela payment_history pode já existir (criada em migration anterior) com created_at/confirmed_at.
-- Se não existir, criamos com paid_at. Se existir, adicionamos paid_at e updated_at se faltarem.

CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  paid_at DATE NOT NULL,
  payment_method TEXT,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE payment_history IS 
'Histórico de pagamentos manuais dos clientes';

-- Compatibilizar tabela já existente (sem paid_at): adicionar colunas se não existirem
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_history' AND column_name = 'paid_at'
  ) THEN
    ALTER TABLE payment_history ADD COLUMN paid_at DATE;
    UPDATE payment_history SET paid_at = (confirmed_at AT TIME ZONE 'UTC')::date WHERE paid_at IS NULL AND confirmed_at IS NOT NULL;
    UPDATE payment_history SET paid_at = (created_at AT TIME ZONE 'UTC')::date WHERE paid_at IS NULL;
    ALTER TABLE payment_history ALTER COLUMN paid_at SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_history' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE payment_history ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_history' AND column_name = 'description'
  ) THEN
    ALTER TABLE payment_history ADD COLUMN description TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_history' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE payment_history ADD COLUMN created_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Índices (usar paid_at se existir, senão created_at)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_payment_history_subscription'
  ) THEN
    CREATE INDEX idx_payment_history_subscription ON payment_history(subscription_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_payment_history_date'
  ) THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_history' AND column_name = 'paid_at') THEN
      CREATE INDEX idx_payment_history_date ON payment_history(paid_at DESC NULLS LAST);
    ELSE
      CREATE INDEX idx_payment_history_date ON payment_history(created_at DESC);
    END IF;
  END IF;
END $$;

-- PASSO 3: TRIGGER PARA ATUALIZAR updated_at (só criar se coluna updated_at existir)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_payment_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payment_history_updated_at ON payment_history;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_history' AND column_name = 'updated_at') THEN
    CREATE TRIGGER payment_history_updated_at
      BEFORE UPDATE ON payment_history
      FOR EACH ROW
      EXECUTE FUNCTION update_payment_history_updated_at();
  END IF;
END $$;

-- PASSO 4: FUNÇÃO PARA ATUALIZAR STATUS DE COBRANÇA
-- ============================================================================

CREATE OR REPLACE FUNCTION update_billing_status(
  p_subscription_id UUID,
  p_new_status TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE subscriptions
  SET 
    billing_status = p_new_status,
    updated_at = NOW()
  WHERE id = p_subscription_id;
  
  -- Se pago, ativar a assinatura
  IF p_new_status = 'paid' THEN
    UPDATE subscriptions
    SET status = 'active'
    WHERE id = p_subscription_id;
  END IF;
  
  -- Se muito atrasado, suspender
  IF p_new_status = 'overdue' THEN
    UPDATE subscriptions
    SET status = 'suspended'
    WHERE id = p_subscription_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_billing_status IS 
'Atualiza status de cobrança e ajusta status da assinatura automaticamente';

-- PASSO 5: FUNÇÃO PARA REGISTRAR PAGAMENTO
-- ============================================================================

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
  
  -- Atualizar status para pago
  PERFORM update_billing_status(p_subscription_id, 'paid');
  
  RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION register_payment IS 
'Registra um pagamento e atualiza status da assinatura para ativo';

-- PASSO 6: VIEW PARA DASHBOARD DE STATUS
-- ============================================================================

CREATE OR REPLACE VIEW vw_clients_status AS
SELECT 
  c.id AS clinic_id,
  c.name AS clinic_name,
  c.cnpj,
  c.email AS clinic_email,
  pr.name AS admin_name,
  pr.email AS admin_email,
  s.id AS subscription_id,
  s.status AS subscription_status,
  COALESCE(s.billing_status, 'pending') AS billing_status,
  COALESCE(s.monthly_fee, 0) AS monthly_fee,
  COALESCE(s.setup_fee, 0) AS setup_fee,
  p.name AS plan_name,
  p.slug AS plan_slug,
  s.created_at AS subscription_created_at,
  COALESCE(
    (SELECT SUM(ph.amount) 
     FROM payment_history ph 
     WHERE ph.subscription_id = s.id),
    0
  ) AS total_paid,
  (SELECT COUNT(*) 
   FROM clinic_users cu2 
   WHERE cu2.user_id = cu.user_id
  ) AS total_clinics_of_admin
FROM clinics c
LEFT JOIN clinic_users cu ON cu.clinic_id = c.id AND cu.is_owner = true
LEFT JOIN profiles pr ON pr.user_id = cu.user_id
LEFT JOIN subscriptions s ON s.clinic_id = c.id
LEFT JOIN plans p ON p.id = s.plan_id
ORDER BY c.name;

COMMENT ON VIEW vw_clients_status IS 
'View consolidada para dashboard de clientes no SuperAdmin';

-- PASSO 7: FUNÇÃO PARA OBTER ESTATÍSTICAS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_superadmin_stats()
RETURNS JSONB AS $$
DECLARE
  v_stats JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_clients', (
      SELECT COUNT(DISTINCT clinic_id) 
      FROM subscriptions
    ),
    'active_clients', (
      SELECT COUNT(*) 
      FROM subscriptions 
      WHERE status = 'active' AND COALESCE(billing_status, 'pending') = 'paid'
    ),
    'pending_clients', (
      SELECT COUNT(*) 
      FROM subscriptions 
      WHERE COALESCE(billing_status, 'pending') = 'pending'
    ),
    'overdue_clients', (
      SELECT COUNT(*) 
      FROM subscriptions 
      WHERE COALESCE(billing_status, 'pending') = 'overdue'
    ),
    'suspended_clients', (
      SELECT COUNT(*) 
      FROM subscriptions 
      WHERE status = 'suspended'
    ),
    'total_mrr', (
      SELECT COALESCE(SUM(monthly_fee), 0) 
      FROM subscriptions 
      WHERE status = 'active'
    ),
    'total_revenue_this_month', (
      SELECT COALESCE(SUM(amount), 0)
      FROM payment_history
      WHERE paid_at >= DATE_TRUNC('month', CURRENT_DATE)
      AND paid_at < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
    )
  ) INTO v_stats;
  
  RETURN v_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_superadmin_stats IS 
'Retorna estatísticas consolidadas para o dashboard do SuperAdmin';

-- PASSO 8: RLS POLICIES PARA PAYMENT_HISTORY
-- ============================================================================

ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SuperAdmin full access to payment_history" ON payment_history;
CREATE POLICY "SuperAdmin full access to payment_history"
  ON payment_history
  FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()));

-- PASSO 9: ADICIONAR POLÍTICA PARA SUPERADMIN ATUALIZAR SUBSCRIPTIONS
-- ============================================================================

DROP POLICY IF EXISTS "SuperAdmin can update subscriptions" ON subscriptions;
CREATE POLICY "SuperAdmin can update subscriptions"
  ON subscriptions
  FOR UPDATE
  TO authenticated
  USING (public.is_superadmin(auth.uid()));

-- PASSO 10: ÍNDICES PARA PERFORMANCE
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_subscriptions_billing_status'
  ) THEN
    CREATE INDEX idx_subscriptions_billing_status ON subscriptions(billing_status);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_subscriptions_status_billing'
  ) THEN
    CREATE INDEX idx_subscriptions_status_billing ON subscriptions(status, billing_status);
  END IF;
END $$;

-- PASSO 11: MIGRAR DADOS EXISTENTES
-- ============================================================================

UPDATE subscriptions
SET 
  billing_status = CASE 
    WHEN status = 'active' THEN 'paid'
    WHEN status = 'trial' THEN 'pending'
    WHEN status IN ('suspended', 'expired', 'cancelled') THEN 'overdue'
    ELSE 'pending'
  END,
  monthly_fee = COALESCE(monthly_fee, 0),
  setup_fee = COALESCE(setup_fee, 0)
WHERE billing_status IS NULL OR monthly_fee IS NULL OR setup_fee IS NULL;

-- ============================================================================
-- FIM DA MIGRAÇÃO
-- ============================================================================

-- Verificar se tudo foi criado corretamente
DO $$
DECLARE
  v_result TEXT;
BEGIN
  -- Verificar colunas
  SELECT string_agg(column_name, ', ') INTO v_result
  FROM information_schema.columns
  WHERE table_name = 'subscriptions' 
  AND column_name IN ('billing_status', 'monthly_fee', 'setup_fee', 'admin_notes');
  
  RAISE NOTICE 'Colunas adicionadas em subscriptions: %', v_result;
  
  -- Verificar tabela
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_history') THEN
    RAISE NOTICE 'Tabela payment_history criada com sucesso!';
  END IF;
  
  -- Verificar funções
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_superadmin_stats') THEN
    RAISE NOTICE 'Função get_superadmin_stats criada com sucesso!';
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'register_payment') THEN
    RAISE NOTICE 'Função register_payment criada com sucesso!';
  END IF;
  
  RAISE NOTICE 'MIGRAÇÃO CONCLUÍDA COM SUCESSO!';
END $$;

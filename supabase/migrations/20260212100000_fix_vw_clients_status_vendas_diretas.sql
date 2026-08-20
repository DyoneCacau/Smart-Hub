-- ============================================================================
-- Correção da view vw_clients_status: usar profiles e is_owner (vendas diretas)
-- A tabela public.users não existe; usar profiles. clinic_users usa is_owner.
-- ============================================================================

DROP VIEW IF EXISTS vw_clients_status;

CREATE OR REPLACE VIEW vw_clients_status AS
SELECT 
  c.id AS clinic_id,
  c.name AS clinic_name,
  c.cnpj,
  c.email AS clinic_email,
  p.name AS admin_name,
  p.email AS admin_email,
  s.id AS subscription_id,
  s.status AS subscription_status,
  COALESCE(s.billing_status, 'pending') AS billing_status,
  COALESCE(s.monthly_fee, 0) AS monthly_fee,
  COALESCE(s.setup_fee, 0) AS setup_fee,
  pl.name AS plan_name,
  pl.slug AS plan_slug,
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
LEFT JOIN profiles p ON p.user_id = cu.user_id
LEFT JOIN subscriptions s ON s.clinic_id = c.id
LEFT JOIN plans pl ON pl.id = s.plan_id
ORDER BY c.name;

COMMENT ON VIEW vw_clients_status IS 
'View consolidada para dashboard de clientes no SuperAdmin (vendas diretas)';

-- Corrigir RLS: usar is_superadmin(auth.uid()) em vez da tabela users
DROP POLICY IF EXISTS "SuperAdmin full access to payment_history" ON payment_history;
CREATE POLICY "SuperAdmin full access to payment_history"
  ON payment_history
  FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "SuperAdmin can update subscriptions" ON subscriptions;
CREATE POLICY "SuperAdmin can update subscriptions"
  ON subscriptions
  FOR UPDATE
  TO authenticated
  USING (public.is_superadmin(auth.uid()));

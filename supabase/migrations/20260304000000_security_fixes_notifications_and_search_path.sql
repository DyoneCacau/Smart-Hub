-- ============================================================================
-- Correções de segurança:
-- 1) user_notifications permitia que qualquer usuário autenticado inserisse
--    notificações em nome de OUTRO usuário (IDOR / spoofing). O INSERT deve
--    ser feito apenas pelo service_role (via funções SECURITY DEFINER como
--    notify_clinic_users_on_appointment) ou pelo próprio usuário.
-- 2) Diversas funções SECURITY DEFINER foram criadas sem `SET search_path`,
--    o que é a vulnerabilidade clássica de "search_path mutável" do Postgres:
--    a função roda com os privilégios do dono, mas resolve nomes de tabela
--    sem um path fixo, abrindo brecha para sequestro de objetos caso algum
--    papel consiga criar tabelas/funções em um schema anterior no path.
--    Corrigimos fixando `search_path = public, pg_temp` em todas as funções
--    SECURITY DEFINER do schema public que ainda não tinham essa proteção.
-- ============================================================================

-- ─── 1. user_notifications: remover policy de INSERT pública ───────────────

DROP POLICY IF EXISTS "System can insert notifications" ON public.user_notifications;

-- Apenas o service_role (Edge Functions / funções SECURITY DEFINER) pode
-- inserir notificações arbitrárias. Usuários comuns não devem inserir
-- notificações para si mesmos nem para terceiros pela API pública.
CREATE POLICY "Service role inserts notifications"
  ON public.user_notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ─── 2. Fixar search_path em todas as funções SECURITY DEFINER do schema public ───

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT p.oid, p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true          -- SECURITY DEFINER
      AND NOT EXISTS (                 -- ainda sem search_path fixado
        SELECT 1
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', rec.signature);
    RAISE NOTICE 'search_path fixado em: %', rec.signature;
  END LOOP;
END;
$$;

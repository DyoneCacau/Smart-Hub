-- ============================================================================
-- PRODUÇÃO 04 — LIMPAR DADOS DE TESTE (EXCETO SUPERADMIN)
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Faça backup antes (schema/data) se ainda não tiver um recente.
-- 2. Execute MANUALMENTE no SQL Editor do painel Supabase (projeto vinculado).
-- 3. Este script APAGA clínicas, assinaturas, pagamentos, organizações e
--    todos os usuários, EXCETO o SuperAdmin abaixo.
-- 4. Planos (plans) NÃO são apagados — ficam para você recriar clientes.
-- 5. Cobranças já criadas no Asaas Sandbox NÃO são apagadas aqui; limpe
--    pelo painel Asaas se quiser zerar também lá.
--
-- PRESERVA:
--   • auth.users / role superadmin: dyonecacau@gmail.com
--
-- APAGA (entre outros):
--   • dh.dev@hotmail.com
--   • dyone.cacau01@aluno.unifametro.edu.br
--   • clínicas RF / RF 1 e todo o restante operacional
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_keep_email CONSTANT text := 'dyonecacau@gmail.com';
  v_keep_user_id uuid;
  v_deleted_users int := 0;
  v_deleted_clinics int := 0;
  v_deleted_orgs int := 0;
  v_deleted_payments int := 0;
  v_deleted_webhooks int := 0;
BEGIN
  SELECT id
    INTO v_keep_user_id
  FROM auth.users
  WHERE LOWER(email) = LOWER(v_keep_email);

  IF v_keep_user_id IS NULL THEN
    RAISE EXCEPTION
      'ABORTADO: SuperAdmin % não encontrado em auth.users. Nada foi apagado.',
      v_keep_email;
  END IF;

  RAISE NOTICE 'SuperAdmin preservado: % (%)', v_keep_email, v_keep_user_id;

  -- 1) Billing / webhooks (podem bloquear delete de subscriptions)
  DELETE FROM public.payment_history;
  GET DIAGNOSTICS v_deleted_payments = ROW_COUNT;

  DELETE FROM public.billing_webhook_events;
  GET DIAGNOSTICS v_deleted_webhooks = ROW_COUNT;

  -- 2) Tabelas de auditoria / ponto (se existirem)
  IF to_regclass('public.audit_events') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.audit_events';
  END IF;
  IF to_regclass('public.financial_audit') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.financial_audit';
  END IF;
  IF to_regclass('public.time_clock_entries') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.time_clock_entries';
  END IF;

  -- 3) Clínicas (CASCADE limpa assinaturas, pacientes, agenda, etc.)
  DELETE FROM public.clinics;
  GET DIAGNOSTICS v_deleted_clinics = ROW_COUNT;

  -- 4) Organizações
  IF to_regclass('public.organizations') IS NOT NULL THEN
    DELETE FROM public.organizations;
    GET DIAGNOSTICS v_deleted_orgs = ROW_COUNT;
  END IF;

  -- 5) Usuários restantes (exceto SuperAdmin)
  --    CASCADE em profiles / user_roles / clinic_users órfãos
  WITH doomed AS (
    DELETE FROM auth.users u
    WHERE u.id <> v_keep_user_id
    RETURNING u.id
  )
  SELECT COUNT(*) INTO v_deleted_users FROM doomed;

  -- 6) Garantir role + profile do SuperAdmin
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = v_keep_user_id
      AND role = 'superadmin'
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_keep_user_id, 'superadmin');
  END IF;

  INSERT INTO public.profiles (user_id, name, email, is_active)
  VALUES (v_keep_user_id, 'Dyone Cacau', v_keep_email, true)
  ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email,
        is_active = true,
        updated_at = now();

  RAISE NOTICE '────────────────────────────────────────';
  RAISE NOTICE 'Limpeza concluída';
  RAISE NOTICE '  payment_history: %', v_deleted_payments;
  RAISE NOTICE '  billing_webhook_events: %', v_deleted_webhooks;
  RAISE NOTICE '  clinics: %', v_deleted_clinics;
  RAISE NOTICE '  organizations: %', v_deleted_orgs;
  RAISE NOTICE '  auth.users removidos: %', v_deleted_users;
  RAISE NOTICE '  preservado: %', v_keep_email;
  RAISE NOTICE '────────────────────────────────────────';
END $$;

-- Resumo final (visível no resultado do SQL Editor)
SELECT
  (SELECT COUNT(*) FROM public.clinics) AS clinics_restantes,
  (SELECT COUNT(*) FROM public.profiles) AS profiles_restantes,
  (SELECT COUNT(*) FROM public.subscriptions) AS subscriptions_restantes,
  (SELECT COUNT(*) FROM public.organizations) AS organizations_restantes,
  (SELECT COUNT(*) FROM public.plans) AS plans_preservados,
  (SELECT COUNT(*) FROM auth.users) AS users_restantes;

SELECT u.email, ur.role, p.name AS profile_name
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
LEFT JOIN public.profiles p ON p.user_id = u.id
ORDER BY u.email;

COMMIT;

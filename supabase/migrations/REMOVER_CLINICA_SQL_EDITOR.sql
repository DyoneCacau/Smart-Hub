-- ============================================================================
-- REMOVER CLÍNICA E USUÁRIO PELO SQL EDITOR
-- ============================================================================
-- 1. Abra o Supabase Dashboard do seu projeto.
-- 2. Vá em SQL Editor > New query.
-- 3. Cole este script.
-- 4. EDITE APENAS AS DUAS LINHAS ABAIXO:
--    - v_clinic_name: nome exato da clínica (ex: 'Clinica Sorriso')
--    - v_email: email do usuário dono (ex: 'dyone.cacauzinho@...')
-- 5. Run (ou Ctrl+Enter).
--
-- Se não conseguir remover de auth.users (permissão), vá em
-- Authentication > Users e apague o usuário pelo email.
-- ============================================================================

DO $$
DECLARE
  v_clinic_id UUID;
  v_user_id UUID;
  -- ========== EDITE AQUI ==========
  v_clinic_name TEXT := 'Clinica Sorriso';   -- Nome da clínica
  v_email TEXT := 'dyone.cacauzinho@...';   -- Email do usuário dono
  -- ===============================
  v_count INT;
BEGIN
  SELECT id INTO v_clinic_id FROM clinics WHERE name = v_clinic_name LIMIT 1;
  IF v_clinic_id IS NULL THEN
    RAISE NOTICE 'Clínica "%" não encontrada. Verifique o nome.', v_clinic_name;
    RETURN;
  END IF;

  RAISE NOTICE 'Removendo clínica: % (id: %)', v_clinic_name, v_clinic_id;

  DELETE FROM payment_history WHERE subscription_id IN (SELECT id FROM subscriptions WHERE clinic_id = v_clinic_id);
  DELETE FROM cash_closings WHERE clinic_id = v_clinic_id;
  DELETE FROM financial_transactions WHERE clinic_id = v_clinic_id;
  DELETE FROM appointments WHERE clinic_id = v_clinic_id;
  DELETE FROM patients WHERE clinic_id = v_clinic_id;
  DELETE FROM professionals WHERE clinic_id = v_clinic_id;
  DELETE FROM terms WHERE clinic_id = v_clinic_id;
  DELETE FROM upgrade_requests WHERE clinic_id = v_clinic_id;
  DELETE FROM commissions WHERE clinic_id = v_clinic_id;
  DELETE FROM inventory_movements WHERE clinic_id = v_clinic_id;
  DELETE FROM inventory_products WHERE clinic_id = v_clinic_id;
  DELETE FROM subscriptions WHERE clinic_id = v_clinic_id;
  DELETE FROM clinic_users WHERE clinic_id = v_clinic_id;
  DELETE FROM clinics WHERE id = v_clinic_id;
  RAISE NOTICE 'Clínica e dados removidos.';

  SELECT user_id INTO v_user_id FROM profiles WHERE LOWER(email) = LOWER(v_email);
  IF v_user_id IS NOT NULL THEN
    DELETE FROM user_roles WHERE user_id = v_user_id;
    DELETE FROM profiles WHERE user_id = v_user_id;
    RAISE NOTICE 'Usuário % removido (profiles e user_roles).', v_email;
    BEGIN
      DELETE FROM auth.users WHERE id = v_user_id;
      RAISE NOTICE 'Usuário removido de auth.users.';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'auth.users: sem permissão. Apague o usuário em Authentication > Users.';
    END;
  ELSE
    RAISE NOTICE 'Usuário % não encontrado em profiles.', v_email;
  END IF;

  RAISE NOTICE 'Concluído.';
END $$;

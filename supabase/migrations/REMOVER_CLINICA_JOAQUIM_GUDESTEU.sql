-- ============================================================================
-- Remove apenas: Clínica "Clínica de Joaquim Gudesteu" e usuário
-- dyone.cacau01@aluno.unifametro.edu.br
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard). Para remover de auth.users
-- pode ser necessário usar "Run as role: service_role" ou excluir o usuário
-- manualmente em Authentication > Users.
-- ============================================================================

DO $$
DECLARE
  v_clinic_id UUID;
  v_user_id UUID;
  v_email TEXT := 'dyone.cacau01@aluno.unifametro.edu.br';
  v_clinic_name TEXT := 'Clínica de Joaquim Gudesteu';
  v_count INT;
BEGIN
  SELECT id INTO v_clinic_id FROM clinics WHERE name = v_clinic_name LIMIT 1;
  IF v_clinic_id IS NULL THEN
    RAISE NOTICE 'Clínica "%" não encontrada.', v_clinic_name;
    RETURN;
  END IF;

  RAISE NOTICE 'Removendo clínica: % (id: %)', v_clinic_name, v_clinic_id;

  -- payment_history (por subscription)
  DELETE FROM payment_history WHERE subscription_id IN (SELECT id FROM subscriptions WHERE clinic_id = v_clinic_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  payment_history: %', v_count;

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
  RAISE NOTICE '  Clínica e dados relacionados removidos.';

  -- Usuário por email
  SELECT user_id INTO v_user_id FROM profiles WHERE LOWER(email) = LOWER(v_email);
  IF v_user_id IS NOT NULL THEN
    DELETE FROM user_roles WHERE user_id = v_user_id;
    DELETE FROM profiles WHERE user_id = v_user_id;
    RAISE NOTICE '  Usuário % removido de profiles e user_roles.', v_email;
    BEGIN
      DELETE FROM auth.users WHERE id = v_user_id;
      RAISE NOTICE '  Usuário removido de auth.users.';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '  Não foi possível remover de auth.users. Remova manualmente em Authentication > Users.';
    END;
  ELSE
    RAISE NOTICE '  Usuário % não encontrado em profiles.', v_email;
  END IF;

  RAISE NOTICE 'Concluído.';
END $$;

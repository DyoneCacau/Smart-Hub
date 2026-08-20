-- ============================================================================
-- SCRIPT DE LIMPEZA - REMOVER DADOS DE TESTE
-- Data: 12/02/2026
-- ============================================================================
-- ATENÇÃO: Este script apaga dados permanentemente!
-- Execute apenas se tiver certeza do que está fazendo.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. REMOVER USUÁRIO: dyone.cacau01@aluno.unifametro.edu.br
-- ============================================================================

DO $$
DECLARE
  v_user_id UUID;
  v_email TEXT := 'dyone.cacau01@aluno.unifametro.edu.br';
BEGIN
  -- Buscar o user_id do email
  SELECT user_id INTO v_user_id
  FROM profiles
  WHERE LOWER(email) = LOWER(v_email);

  IF v_user_id IS NOT NULL THEN
    RAISE NOTICE 'Removendo usuário: % (ID: %)', v_email, v_user_id;

    -- 1.1. Remover de clinic_users
    DELETE FROM clinic_users WHERE user_id = v_user_id;
    RAISE NOTICE '  ✓ Removido de clinic_users';

    -- 1.2. Remover de user_roles
    DELETE FROM user_roles WHERE user_id = v_user_id;
    RAISE NOTICE '  ✓ Removido de user_roles';

    -- 1.3. Remover de profiles
    DELETE FROM profiles WHERE user_id = v_user_id;
    RAISE NOTICE '  ✓ Removido de profiles';

    -- 1.4. Remover de auth.users (requer privilégios de superusuário)
    -- Se estiver usando Supabase, pode não conseguir fazer isso diretamente
    -- Nesse caso, use o Dashboard do Supabase
    DELETE FROM auth.users WHERE id = v_user_id;
    RAISE NOTICE '  ✓ Removido de auth.users';

    RAISE NOTICE '✓ Usuário % removido completamente!', v_email;
  ELSE
    RAISE NOTICE '⚠ Usuário % não encontrado', v_email;
  END IF;
END $$;

-- ============================================================================
-- 2. REMOVER CLÍNICAS DE TESTE
-- ============================================================================

DO $$
DECLARE
  v_clinic_id UUID;
  v_clinic_name TEXT;
  v_clinics_to_delete TEXT[] := ARRAY['teste', 'teste piloto', 'clinica sorriso'];
  v_clinic TEXT;
BEGIN
  FOREACH v_clinic IN ARRAY v_clinics_to_delete
  LOOP
    -- Buscar clínica pelo nome (case-insensitive)
    SELECT id, name INTO v_clinic_id, v_clinic_name
    FROM clinics
    WHERE LOWER(name) = LOWER(v_clinic)
    LIMIT 1;

    IF v_clinic_id IS NOT NULL THEN
      RAISE NOTICE 'Removendo clínica: % (ID: %)', v_clinic_name, v_clinic_id;

      -- 2.1. Remover todos os vínculos de usuários com a clínica
      DELETE FROM clinic_users WHERE clinic_id = v_clinic_id;
      RAISE NOTICE '  ✓ Removidos vínculos de usuários';

      -- 2.2. Remover agendamentos da clínica
      DELETE FROM appointments WHERE clinic_id = v_clinic_id;
      RAISE NOTICE '  ✓ Removidos agendamentos';

      -- 2.3. Remover pacientes da clínica
      DELETE FROM patients WHERE clinic_id = v_clinic_id;
      RAISE NOTICE '  ✓ Removidos pacientes';

      -- 2.4. Remover profissionais da clínica
      DELETE FROM professionals WHERE clinic_id = v_clinic_id;
      RAISE NOTICE '  ✓ Removidos profissionais';

      -- 2.5. Remover transações financeiras da clínica
      DELETE FROM financial_transactions WHERE clinic_id = v_clinic_id;
      RAISE NOTICE '  ✓ Removidas transações financeiras';

      -- 2.6. Remover estoque da clínica
      DELETE FROM inventory_items WHERE clinic_id = v_clinic_id;
      RAISE NOTICE '  ✓ Removidos itens de estoque';

      -- 2.7. Remover movimentações de estoque da clínica
      DELETE FROM inventory_movements WHERE clinic_id = v_clinic_id;
      RAISE NOTICE '  ✓ Removidas movimentações de estoque';

      -- 2.8. Remover comissões da clínica
      DELETE FROM commissions WHERE clinic_id = v_clinic_id;
      RAISE NOTICE '  ✓ Removidas comissões';

      -- 2.9. Remover registros de ponto da clínica
      DELETE FROM time_clock_entries 
      WHERE user_id IN (
        SELECT user_id FROM clinic_users WHERE clinic_id = v_clinic_id
      );
      RAISE NOTICE '  ✓ Removidos registros de ponto';

      -- 2.10. Finalmente, remover a clínica
      DELETE FROM clinics WHERE id = v_clinic_id;
      RAISE NOTICE '  ✓ Clínica removida';

      RAISE NOTICE '✓ Clínica % removida completamente!', v_clinic_name;
    ELSE
      RAISE NOTICE '⚠ Clínica "%s" não encontrada', v_clinic;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 3. LISTAR DADOS REMANESCENTES
-- ============================================================================

DO $$
DECLARE
  v_total_users INT;
  v_total_clinics INT;
  v_total_superadmins INT;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE 'LIMPEZA CONCLUÍDA - RESUMO DO BANCO';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  
  -- Contar usuários
  SELECT COUNT(*) INTO v_total_users FROM profiles;
  RAISE NOTICE 'Total de usuários: %', v_total_users;

  -- Contar clínicas
  SELECT COUNT(*) INTO v_total_clinics FROM clinics;
  RAISE NOTICE 'Total de clínicas: %', v_total_clinics;

  -- Contar superadmins
  SELECT COUNT(*) INTO v_total_superadmins 
  FROM user_roles 
  WHERE role = 'superadmin';
  RAISE NOTICE 'Total de superadmins: %', v_total_superadmins;

  RAISE NOTICE '';
  RAISE NOTICE 'Clínicas restantes:';
  FOR v_total_users IN 
    SELECT id, name FROM clinics ORDER BY name
  LOOP
    RAISE NOTICE '  - %', (SELECT name FROM clinics WHERE id = v_total_users);
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE 'Usuários restantes:';
  FOR v_total_users IN 
    SELECT user_id FROM profiles ORDER BY name
  LOOP
    RAISE NOTICE '  - % <%>', 
      (SELECT name FROM profiles WHERE user_id = v_total_users),
      (SELECT email FROM profiles WHERE user_id = v_total_users);
  END LOOP;

  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;

-- ============================================================================
-- 4. COMMIT OU ROLLBACK
-- ============================================================================
-- Se tudo estiver OK, descomente o COMMIT abaixo
-- Se quiser cancelar, descomente o ROLLBACK

-- COMMIT;
ROLLBACK; -- Remova esta linha e descomente COMMIT para aplicar as mudanças

-- ============================================================================
-- INSTRUÇÕES DE USO:
-- ============================================================================
-- 1. ATENÇÃO: Por padrão, este script faz ROLLBACK (não aplica mudanças)
-- 2. Execute primeiro com ROLLBACK para ver o que será removido
-- 3. Se estiver correto, substitua ROLLBACK por COMMIT
-- 4. Execute novamente para aplicar as mudanças
--
-- OU use o script abaixo que já faz COMMIT automaticamente:
-- ============================================================================

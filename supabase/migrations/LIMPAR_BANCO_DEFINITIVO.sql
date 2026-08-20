-- ============================================================================
-- SCRIPT DE LIMPEZA DEFINITIVO - APLICA MUDANÇAS AUTOMATICAMENTE
-- Data: 12/02/2026
-- ============================================================================
-- ATENÇÃO: Este script APAGA dados permanentemente e faz COMMIT automático!
-- ============================================================================

-- ============================================================================
-- 1. REMOVER USUÁRIO: dyone.cacau01@aluno.unifametro.edu.br
-- ============================================================================

DO $$
DECLARE
  v_user_id UUID;
  v_email TEXT := 'dyone.cacau01@aluno.unifametro.edu.br';
BEGIN
  SELECT user_id INTO v_user_id
  FROM profiles
  WHERE LOWER(email) = LOWER(v_email);

  IF v_user_id IS NOT NULL THEN
    RAISE NOTICE '🗑️ Removendo usuário: % (ID: %)', v_email, v_user_id;

    DELETE FROM clinic_users WHERE user_id = v_user_id;
    DELETE FROM user_roles WHERE user_id = v_user_id;
    DELETE FROM profiles WHERE user_id = v_user_id;
    
    -- Tentar remover de auth.users (pode requerer privilégios especiais)
    BEGIN
      DELETE FROM auth.users WHERE id = v_user_id;
      RAISE NOTICE '✓ Usuário removido completamente de auth.users';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '⚠ Não foi possível remover de auth.users (use o Dashboard do Supabase)';
    END;

    RAISE NOTICE '✓ Usuário % removido!', v_email;
  ELSE
    RAISE NOTICE 'ℹ️ Usuário % não encontrado (já foi removido?)', v_email;
  END IF;
END $$;

-- ============================================================================
-- 2. REMOVER CLÍNICAS DE TESTE
-- ============================================================================

DO $$
DECLARE
  v_clinic RECORD;
  v_count INT;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🗑️ Removendo clínicas de teste...';
  
  FOR v_clinic IN 
    SELECT id, name 
    FROM clinics 
    WHERE LOWER(name) IN ('teste', 'teste piloto', 'clinica sorriso')
  LOOP
    RAISE NOTICE '';
    RAISE NOTICE '  Removendo clínica: %', v_clinic.name;
    
    -- Remover todos os dados relacionados à clínica
    DELETE FROM clinic_users WHERE clinic_id = v_clinic.id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '    ✓ % vínculos de usuários removidos', v_count;
    
    DELETE FROM appointments WHERE clinic_id = v_clinic.id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '    ✓ % agendamentos removidos', v_count;
    
    DELETE FROM patients WHERE clinic_id = v_clinic.id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '    ✓ % pacientes removidos', v_count;
    
    DELETE FROM professionals WHERE clinic_id = v_clinic.id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '    ✓ % profissionais removidos', v_count;
    
    DELETE FROM financial_transactions WHERE clinic_id = v_clinic.id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '    ✓ % transações removidas', v_count;
    
    DELETE FROM inventory_items WHERE clinic_id = v_clinic.id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '    ✓ % itens de estoque removidos', v_count;
    
    DELETE FROM inventory_movements WHERE clinic_id = v_clinic.id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '    ✓ % movimentações removidas', v_count;
    
    DELETE FROM commissions WHERE clinic_id = v_clinic.id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '    ✓ % comissões removidas', v_count;
    
    DELETE FROM clinics WHERE id = v_clinic.id;
    RAISE NOTICE '    ✓ Clínica removida!';
  END LOOP;
END $$;

-- ============================================================================
-- 3. REMOVER USUÁRIOS SEM CLÍNICA (exceto superadmins)
-- ============================================================================

DO $$
DECLARE
  v_user RECORD;
  v_count INT := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🗑️ Removendo usuários órfãos (sem clínica)...';
  
  FOR v_user IN 
    SELECT p.user_id, p.name, p.email
    FROM profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM clinic_users cu WHERE cu.user_id = p.user_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'superadmin'
    )
  LOOP
    v_count := v_count + 1;
    RAISE NOTICE '  Removendo: % <%>', v_user.name, v_user.email;
    
    DELETE FROM user_roles WHERE user_id = v_user.user_id;
    DELETE FROM profiles WHERE user_id = v_user.user_id;
    
    BEGIN
      DELETE FROM auth.users WHERE id = v_user.user_id;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- Ignora se não conseguir remover
    END;
  END LOOP;
  
  IF v_count = 0 THEN
    RAISE NOTICE '  ✓ Nenhum usuário órfão encontrado';
  ELSE
    RAISE NOTICE '  ✓ % usuários órfãos removidos', v_count;
  END IF;
END $$;

-- ============================================================================
-- 4. RESUMO FINAL
-- ============================================================================

DO $$
DECLARE
  v_clinic RECORD;
  v_user RECORD;
  v_total_clinics INT;
  v_total_users INT;
  v_total_superadmins INT;
BEGIN
  SELECT COUNT(*) INTO v_total_clinics FROM clinics;
  SELECT COUNT(*) INTO v_total_users FROM profiles;
  SELECT COUNT(*) INTO v_total_superadmins FROM user_roles WHERE role = 'superadmin';

  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ LIMPEZA CONCLUÍDA COM SUCESSO!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📊 RESUMO DO BANCO DE DADOS:';
  RAISE NOTICE '   • Total de clínicas: %', v_total_clinics;
  RAISE NOTICE '   • Total de usuários: %', v_total_users;
  RAISE NOTICE '   • Total de superadmins: %', v_total_superadmins;
  RAISE NOTICE '';
  
  IF v_total_clinics > 0 THEN
    RAISE NOTICE '🏥 CLÍNICAS RESTANTES:';
    FOR v_clinic IN SELECT id, name FROM clinics ORDER BY name LOOP
      RAISE NOTICE '   • %', v_clinic.name;
    END LOOP;
  ELSE
    RAISE NOTICE '⚠️ ATENÇÃO: Nenhuma clínica restante!';
  END IF;
  
  RAISE NOTICE '';
  
  IF v_total_users > 0 THEN
    RAISE NOTICE '👤 USUÁRIOS RESTANTES:';
    FOR v_user IN SELECT name, email FROM profiles ORDER BY name LOOP
      RAISE NOTICE '   • % <%>', v_user.name, v_user.email;
    END LOOP;
  ELSE
    RAISE NOTICE '⚠️ ATENÇÃO: Nenhum usuário restante!';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Banco de dados limpo e pronto para novos testes!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;

-- =============================================================================
-- REMOVER USUÁRIO POR E-MAIL (apaga tudo: perfis, vínculos, auth)
-- Use para limpar um usuário de teste (ex.: funcionário criado errado) e poder
-- recriar depois na clínica correta.
--
-- Fluxo esperado:
-- - Você acessa "Clínica Teste piloto" com dh.dev@hotmail.com (admin).
-- - Em Administração > Usuários cria um funcionário (ex.: outro e-mail).
-- - Esse funcionário deve logar e ver TUDO da "Clínica Teste piloto".
--
-- IMPORTANTE: Antes de recriar o usuário, execute também o script
-- APLICAR_TRIGGER_SKIP_AUTO_CLINIC_SQL_EDITOR.sql (uma vez no projeto),
-- senão ao cadastrar de novo o funcionário a "clínica nova" voltará a aparecer.
--
-- Troque o e-mail abaixo e execute no SQL Editor.
-- =============================================================================

DO $$
DECLARE
  v_email TEXT := 'dyone.cacau01@aluno.unifametro.edu.br';  -- e-mail a remover
  v_user_id UUID;
  v_clinic_orphan_id UUID;
  v_clinic_name TEXT;
BEGIN
  -- Buscar user_id (em auth.users para garantir)
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
  IF v_user_id IS NULL THEN
    SELECT user_id INTO v_user_id FROM public.profiles WHERE LOWER(email) = LOWER(v_email);
  END IF;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Nenhum usuário encontrado com o e-mail "%".', v_email;
    RETURN;
  END IF;

  RAISE NOTICE 'Removendo todos os registros do usuário % (id: %)', v_email, v_user_id;

  -- 1) Remover a clínica da qual ele é DONO (a "Clínica de [nome]" criada pelo trigger), se existir
  SELECT id, name INTO v_clinic_orphan_id, v_clinic_name
  FROM public.clinics WHERE owner_user_id = v_user_id LIMIT 1;
  IF v_clinic_orphan_id IS NOT NULL THEN
    RAISE NOTICE 'Removendo clínica órfã: "%" (id: %)', v_clinic_name, v_clinic_orphan_id;
    DELETE FROM payment_history WHERE subscription_id IN (SELECT id FROM subscriptions WHERE clinic_id = v_clinic_orphan_id);
    DELETE FROM cash_closings WHERE clinic_id = v_clinic_orphan_id;
    DELETE FROM financial_transactions WHERE clinic_id = v_clinic_orphan_id;
    DELETE FROM appointments WHERE clinic_id = v_clinic_orphan_id;
    DELETE FROM patients WHERE clinic_id = v_clinic_orphan_id;
    DELETE FROM professionals WHERE clinic_id = v_clinic_orphan_id;
    DELETE FROM terms WHERE clinic_id = v_clinic_orphan_id;
    DELETE FROM upgrade_requests WHERE clinic_id = v_clinic_orphan_id;
    DELETE FROM commissions WHERE clinic_id = v_clinic_orphan_id;
    DELETE FROM inventory_movements WHERE clinic_id = v_clinic_orphan_id;
    DELETE FROM inventory_products WHERE clinic_id = v_clinic_orphan_id;
    DELETE FROM subscriptions WHERE clinic_id = v_clinic_orphan_id;
    DELETE FROM clinic_users WHERE clinic_id = v_clinic_orphan_id;
    DELETE FROM clinics WHERE id = v_clinic_orphan_id;
  END IF;

  -- 2) Tabelas que referenciam user_id (ordem para não quebrar FK)
  DELETE FROM public.time_clock_entries WHERE user_id = v_user_id;
  DELETE FROM public.support_tickets WHERE user_id = v_user_id;
  DELETE FROM public.audit_events WHERE user_id = v_user_id;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'financial_audit') THEN
    DELETE FROM public.financial_audit WHERE user_id = v_user_id;
  END IF;
  DELETE FROM public.clinic_users WHERE user_id = v_user_id;
  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  DELETE FROM public.profiles WHERE user_id = v_user_id;

  -- Remover de auth.users (login deixa de funcionar)
  BEGIN
    DELETE FROM auth.users WHERE id = v_user_id;
    RAISE NOTICE 'Usuário removido de auth.users. Este e-mail não conseguirá mais logar.';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Não foi possível apagar de auth.users (%). Apague manualmente em Authentication > Users pelo e-mail.', SQLERRM;
  END;

  RAISE NOTICE 'Concluído. Você pode recriar o funcionário em Administração > Usuários (ele entrará só na Clínica Teste piloto).';
END $$;

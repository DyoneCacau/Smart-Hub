-- =============================================================================
-- REMOVER A "CLÍNICA ÓRFÃ" (criada pelo trigger) para o usuário que foi
-- cadastrado na outra clínica. Assim ele fica só na clínica correta e
-- a clínica errada some da lista "Minhas Clínicas".
--
-- Troque o e-mail abaixo pelo do usuário afetado e execute no SQL Editor.
-- =============================================================================

DO $$
DECLARE
  v_user_id UUID;
  v_clinic_orphan_id UUID;
  v_clinic_name TEXT;
BEGIN
  -- 1) Buscar o user_id pelo e-mail (troque o e-mail se for outro usuário)
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'dyone.cacau01@aluno.unifametro.edu.br';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado. Altere o e-mail no script.';
  END IF;

  -- 2) Buscar a clínica da qual ele é DONO (criada pelo trigger ao se cadastrar)
  SELECT id, name INTO v_clinic_orphan_id, v_clinic_name
  FROM public.clinics
  WHERE owner_user_id = v_user_id
  LIMIT 1;

  IF v_clinic_orphan_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma clínica órfã encontrada (owner = este usuário).';
  END IF;

  RAISE NOTICE 'Removendo clínica órfã: "%" (id: %)', v_clinic_name, v_clinic_orphan_id;

  -- 3) Remover dados que referenciam esta clínica (ordem por causa de FKs)
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

  RAISE NOTICE 'Clínica órfã removida. O usuário permanece apenas na clínica onde foi cadastrado (ex.: Teste piloto).';
END $$;

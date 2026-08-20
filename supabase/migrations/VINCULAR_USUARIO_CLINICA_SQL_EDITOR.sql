-- =============================================================================
-- VINCULAR USUÁRIO EXISTENTE À CLÍNICA (quando foi criado sem vínculo)
-- Use se o usuário já existe mas não aparece na lista (Administração > Usuários)
-- nem em "Minhas Clínicas" (contagem Usuários) nem vê o nome da clínica no menu.
--
-- Passos: 1) Troque v_email e v_clinic_name abaixo se precisar.
--         2) Supabase Dashboard > SQL Editor > Cole e execute (Run).
--         3) Recarregue a página e faça logout/login se precisar.
-- =============================================================================

DO $$
DECLARE
  v_email TEXT := 'dyone.cacau01@aluno.unifametro.edu.br';  -- e-mail do usuário
  v_clinic_name TEXT := 'Clínica Teste piloto';             -- nome (aceita parecido: Teste piloto, Clinica Teste piloto)
  v_user_id UUID;
  v_clinic_id UUID;
  v_clinic_found_name TEXT;
BEGIN
  -- Buscar user_id (auth ou profiles)
  SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = LOWER(TRIM(v_email));
  IF v_user_id IS NULL THEN
    SELECT user_id INTO v_user_id FROM public.profiles WHERE LOWER(email) = LOWER(TRIM(v_email));
  END IF;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário com e-mail "%" não encontrado.', v_email;
  END IF;

  -- Buscar clínica por nome (ILIKE aceita acento e variação)
  SELECT id, name INTO v_clinic_id, v_clinic_found_name
  FROM public.clinics
  WHERE TRIM(name) ILIKE '%' || TRIM(v_clinic_name) || '%'
  ORDER BY name
  LIMIT 1;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Clínica com nome contendo "%" não encontrada.', v_clinic_name;
  END IF;

  -- 1) Vincular à clínica
  INSERT INTO public.clinic_users (clinic_id, user_id, is_owner)
  VALUES (v_clinic_id, v_user_id, false)
  ON CONFLICT (clinic_id, user_id) DO NOTHING;

  -- 2) Garantir que tem role (senão não aparece em Administração > Usuários)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'receptionist')
  ON CONFLICT (user_id, role) DO NOTHING;

  RAISE NOTICE 'Usuário % vinculado à clínica "%" (id: %). Role receptionist garantida.', v_email, v_clinic_found_name, v_clinic_id;
END $$;

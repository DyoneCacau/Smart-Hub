-- =============================================================================
-- APLICAR TRIGGER: não criar clínica quando admin cadastra funcionário
-- =============================================================================
-- Execute este script no SQL Editor do Supabase (uma vez).
-- Depois disso, ao criar usuário em Administração > Usuários, o sistema
-- NÃO criará mais "Clínica de [nome]" para esse usuário; ele ficará só
-- na clínica onde foi cadastrado (ex.: Clínica Teste piloto).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_clinic_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clinic_name text;
  trial_plan_id uuid;
  trial_ends_at timestamptz;
  clinic_id uuid;
BEGIN
  -- Se o usuário foi convidado por um admin (cadastro dentro de uma clínica), não criar clínica nova
  IF COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'skip_auto_clinic', ''), ''), '') = 'true' THEN
    RETURN NEW;
  END IF;

  -- Skip if clinic already exists for this user
  IF EXISTS (SELECT 1 FROM public.clinic_users WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  clinic_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'clinic_name', ''),
    'Clínica de ' || COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), split_part(NEW.email, '@', 1))
  );

  SELECT id INTO trial_plan_id FROM public.plans WHERE slug = 'trial' LIMIT 1;
  trial_ends_at := now() + interval '7 days';

  INSERT INTO public.clinics (name, email, phone, owner_user_id, is_active)
  VALUES (
    clinic_name,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    NEW.id,
    true
  )
  RETURNING id INTO clinic_id;

  INSERT INTO public.subscriptions (
    clinic_id,
    plan_id,
    status,
    trial_ends_at,
    payment_status,
    current_period_start,
    current_period_end
  ) VALUES (
    clinic_id,
    trial_plan_id,
    'trial',
    trial_ends_at,
    'pending',
    now(),
    trial_ends_at
  );

  INSERT INTO public.clinic_users (clinic_id, user_id, is_owner)
  VALUES (clinic_id, NEW.id, true)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- O trigger já existe (criado em migration anterior); a função acima foi só atualizada.
-- Se precisar recriar o trigger:
-- DROP TRIGGER IF EXISTS on_auth_user_create_clinic ON auth.users;
-- CREATE TRIGGER on_auth_user_create_clinic
--   AFTER INSERT ON auth.users
--   FOR EACH ROW
--   EXECUTE FUNCTION public.create_clinic_on_signup();

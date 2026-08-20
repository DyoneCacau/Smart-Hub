-- Garante que usuarios da clinica possam ler a assinatura
DROP POLICY IF EXISTS "Clinic users can view their subscription" ON public.subscriptions;
CREATE POLICY "Clinic users can view their subscription"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()));

-- Superadmin pode ver todos os perfis (necessario para "Adicionar Unidade" buscar admin por email)
DROP POLICY IF EXISTS "Superadmins can view all profiles" ON public.profiles;
CREATE POLICY "Superadmins can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

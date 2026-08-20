-- Permite que qualquer membro da clínica LEIA as permissões (para o menu respeitar a matriz).
-- Sem isso, recepcionista/vendedor não conseguem ler clinic_role_permissions e o app trata como "acesso total".

CREATE POLICY "Clinic members can read role permissions"
  ON public.clinic_role_permissions FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  );

-- Leitura das permissões de funções personalizadas para quem pertence à clínica
CREATE POLICY "Clinic members can read custom role permissions"
  ON public.clinic_custom_role_permissions FOR SELECT
  USING (
    clinic_custom_role_id IN (
      SELECT id FROM public.clinic_custom_roles
      WHERE clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
    )
  );

-- Usuário pode ler qual função custom tem na clínica (para aplicar as permissões)
CREATE POLICY "Users can read own custom role assignment"
  ON public.user_clinic_custom_roles FOR SELECT
  USING (user_id = auth.uid());

-- Leitura de funções custom da clínica (para resolver o clinic_custom_role_id)
CREATE POLICY "Clinic members can read custom roles"
  ON public.clinic_custom_roles FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  );

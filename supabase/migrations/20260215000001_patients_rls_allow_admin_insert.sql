-- Permite que administradores da clínica cadastrem pacientes mesmo quando
-- user_has_feature falha (ex.: plano sem feature, assinatura inativa).
-- Mantém exigência para outros perfis: precisam da feature no plano.

-- 1) Corrigir user_has_feature para plans.features em formato array (se ainda não aplicado)
CREATE OR REPLACE FUNCTION public.user_has_feature(_user_id uuid, _feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN public.is_superadmin(_user_id) THEN true
      WHEN _feature IN ('dashboard', 'configuracoes') THEN true
      ELSE (
        SELECT 
          CASE 
            WHEN s.status IN ('active', 'trial') AND 
                 (s.trial_ends_at IS NULL OR s.trial_ends_at > now()) THEN
              (
                (p.features @> jsonb_build_array(_feature))
                OR (_feature = 'pacientes' AND (p.features @> jsonb_build_array('pacientes_basico')))
                OR (_feature = 'financeiro' AND (p.features @> jsonb_build_array('financeiro_basico')))
              )
            ELSE false
          END
        FROM public.clinic_users cu
        JOIN public.subscriptions s ON s.clinic_id = cu.clinic_id
        LEFT JOIN public.plans p ON p.id = s.plan_id
        WHERE cu.user_id = _user_id
        LIMIT 1
      )
    END
$$;

-- 2) Política de INSERT: usuário da clínica E (tem feature pacientes OU é admin/superadmin)
DROP POLICY IF EXISTS "Users can insert clinic patients with feature" ON public.patients;
CREATE POLICY "Users can insert clinic patients with feature or admin"
ON public.patients FOR INSERT
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND (
    public.user_has_feature(auth.uid(), 'pacientes')
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  )
);

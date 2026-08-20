-- ============================================================
-- PRODUÇÃO 10 — PERMISSÕES GRANULARES EM clinic_procedures
-- ============================================================
-- INSTRUÇÕES:
-- 1. Execute após PRODUCAO_09_CLINIC_PROCEDURES.sql.
-- 2. No Supabase: SQL Editor > New query > cole este arquivo > Run.
-- 3. SELECT continua liberado para membros da clínica (Agenda/Comissões).
-- 4. INSERT/UPDATE/DELETE passam a respeitar a matriz "procedimentos".
--    Admin/owner/superadmin continuam com acesso pleno via user_can_clinic_action.
--
-- Este script NÃO sobe com o deploy da Vercel.

BEGIN;

DROP POLICY IF EXISTS "Clinic members can view procedures" ON public.clinic_procedures;
DROP POLICY IF EXISTS "Clinic admins can create procedures" ON public.clinic_procedures;
DROP POLICY IF EXISTS "Clinic admins can update procedures" ON public.clinic_procedures;
DROP POLICY IF EXISTS "Clinic admins can delete procedures" ON public.clinic_procedures;
DROP POLICY IF EXISTS "Users can view clinic procedures" ON public.clinic_procedures;
DROP POLICY IF EXISTS "Users can insert clinic procedures" ON public.clinic_procedures;
DROP POLICY IF EXISTS "Users can update clinic procedures" ON public.clinic_procedures;
DROP POLICY IF EXISTS "Users can delete clinic procedures" ON public.clinic_procedures;

-- Leitura: qualquer membro da clínica (necessário para Agenda e Comissões)
CREATE POLICY "Users can view clinic procedures"
  ON public.clinic_procedures
  FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (
      SELECT cu.clinic_id
      FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid()
    )
    OR public.is_superadmin(auth.uid())
  );

CREATE POLICY "Users can insert clinic procedures"
  ON public.clinic_procedures
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_clinic_action(clinic_id, 'procedimentos', 'can_create'));

CREATE POLICY "Users can update clinic procedures"
  ON public.clinic_procedures
  FOR UPDATE
  TO authenticated
  USING (public.user_can_clinic_action(clinic_id, 'procedimentos', 'can_edit'))
  WITH CHECK (public.user_can_clinic_action(clinic_id, 'procedimentos', 'can_edit'));

CREATE POLICY "Users can delete clinic procedures"
  ON public.clinic_procedures
  FOR DELETE
  TO authenticated
  USING (public.user_can_clinic_action(clinic_id, 'procedimentos', 'can_delete'));

COMMIT;

-- VERIFICAÇÃO:
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'clinic_procedures'
ORDER BY policyname;

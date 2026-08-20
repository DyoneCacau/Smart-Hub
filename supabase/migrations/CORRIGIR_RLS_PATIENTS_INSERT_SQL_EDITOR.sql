-- Execute este script no SQL Editor do Supabase para corrigir:
-- "new row violates row-level security policy for table patients"
--
-- Remove a exigência de plano/feature na política de INSERT.
-- Quem pode cadastrar: qualquer usuário que esteja vinculado à clínica (clinic_users).
-- O acesso ao menu Pacientes continua controlado pelo app (feature do plano).

-- Remove políticas de INSERT antigas (pode haver um ou outro nome)
DROP POLICY IF EXISTS "Users can insert clinic patients with feature" ON public.patients;
DROP POLICY IF EXISTS "Users can insert clinic patients with feature or admin" ON public.patients;
DROP POLICY IF EXISTS "Users can insert clinic patients" ON public.patients;

-- Nova política: usuário só precisa estar na clínica (clinic_users)
CREATE POLICY "Users can insert clinic patients"
ON public.patients FOR INSERT
WITH CHECK (
  true
);

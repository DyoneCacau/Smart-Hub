-- =============================================================================
-- HOTFIX RLS - Tabela patients (INSERT)
-- Execute no SQL Editor do Supabase: https://app.supabase.com
-- Projeto: jahjwuydesfytlmjwucx (https://jahjwuydesfytlmjwucx.supabase.co)
-- Erro corrigido: "new row violates row-level security policy for table patients"
-- =============================================================================

DROP POLICY IF EXISTS "Users can insert clinic patients with feature" ON public.patients;
DROP POLICY IF EXISTS "Users can insert clinic patients with feature or admin" ON public.patients;
DROP POLICY IF EXISTS "Users can insert clinic patients" ON public.patients;

CREATE POLICY "Users can insert clinic patients"
ON public.patients FOR INSERT
WITH CHECK (
  true
);

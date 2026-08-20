-- Corrige erro ao cadastrar profissional (RLS na tabela professionals)
-- Execute no SQL Editor do Supabase: https://app.supabase.com

DROP POLICY IF EXISTS "Admins can insert professionals with feature check" ON public.professionals;
DROP POLICY IF EXISTS "Admins can insert professionals in own clinic" ON public.professionals;

CREATE POLICY "Users can insert clinic professionals"
ON public.professionals FOR INSERT
WITH CHECK (
  clinic_id IN (
    SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()
  )
);

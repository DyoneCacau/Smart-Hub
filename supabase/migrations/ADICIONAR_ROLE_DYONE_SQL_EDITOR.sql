-- =============================================================================
-- SÓ ADICIONAR ROLE DO DYONE (ele já está na clínica; sem role não aparece na lista)
-- Cole no Supabase > SQL Editor > Run.
-- =============================================================================

INSERT INTO public.user_roles (user_id, role)
VALUES ('bd87a87c-00b1-4d61-b368-e40ed9bc99fd'::uuid, 'receptionist')
ON CONFLICT (user_id, role) DO NOTHING;

-- Confira: deve retornar 1 linha com user_id e role
SELECT user_id, role FROM public.user_roles WHERE user_id = 'bd87a87c-00b1-4d61-b368-e40ed9bc99fd'::uuid;

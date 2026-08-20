-- =============================================================================
-- DIAGNÓSTICO: por que dyone.cacau01 não aparece na lista de usuários do dh.dev
-- Execute no SQL Editor e confira o resultado (aba Results).
-- =============================================================================

-- 1) Usuário dyone existe?
SELECT '1. auth.users (dyone)' AS passo, id, email, created_at
FROM auth.users WHERE email = 'dyone.cacau01@aluno.unifametro.edu.br';

SELECT '2. profiles (dyone)' AS passo, user_id, name, email
FROM public.profiles WHERE LOWER(email) = LOWER('dyone.cacau01@aluno.unifametro.edu.br');

-- 3) Clínicas com nome parecido com "Teste piloto" (pode ter acento diferente)
SELECT '3. clinics (nome)' AS passo, id, name, owner_user_id
FROM public.clinics
WHERE name ILIKE '%teste%' OR name ILIKE '%piloto%'
ORDER BY name;

-- 4) dh.dev: user_id e em qual(is) clínica(s) está
SELECT '4. dh.dev em clinic_users' AS passo, cu.clinic_id, c.name AS clinic_name, cu.is_owner
FROM auth.users u
JOIN public.clinic_users cu ON cu.user_id = u.id
JOIN public.clinics c ON c.id = cu.clinic_id
WHERE u.email = 'dh.dev@hotmail.com';

-- 5) Quem está em clinic_users na "Clínica Teste piloto" (id da clínica do passo 3)
SELECT '5. usuários na clínica Teste piloto' AS passo, cu.user_id, p.name, p.email, cu.is_owner
FROM public.clinic_users cu
JOIN public.clinics c ON c.id = cu.clinic_id
LEFT JOIN public.profiles p ON p.user_id = cu.user_id
WHERE c.name ILIKE '%teste%piloto%' OR c.name ILIKE '%piloto%'
ORDER BY cu.is_owner DESC;

-- 6) dyone tem user_roles? (sem role, não aparece na lista)
SELECT '6. user_roles (dyone)' AS passo, ur.user_id, ur.role
FROM public.user_roles ur
JOIN public.profiles p ON p.user_id = ur.user_id
WHERE LOWER(p.email) = LOWER('dyone.cacau01@aluno.unifametro.edu.br');

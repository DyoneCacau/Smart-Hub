-- ============================================================
-- Vincular admin às clínicas (dono de múltiplas unidades)
-- Execute no Supabase: SQL Editor > New Query > Cole e Execute
-- ============================================================
-- O admin (dh.dev@hotmail.com) é dono das clínicas RF e RF 1.
-- Este script vincula o usuário às duas clínicas.

INSERT INTO public.clinic_users (clinic_id, user_id, is_owner)
VALUES
  ('2dd30351-a7f1-454d-9ab0-988e4d32bb23'::uuid, '9836e56c-601f-415a-a06c-a406da7ca49c'::uuid, true),
  ('193c1651-02f2-4146-9b5b-960b0eb635d1'::uuid, '9836e56c-601f-415a-a06c-a406da7ca49c'::uuid, true)
ON CONFLICT DO NOTHING;

-- Garantir que o usuário tenha role admin
INSERT INTO public.user_roles (user_id, role)
VALUES ('9836e56c-601f-415a-a06c-a406da7ca49c'::uuid, 'admin')
ON CONFLICT DO NOTHING;

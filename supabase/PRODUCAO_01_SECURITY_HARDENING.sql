-- ============================================================================
-- PRODUÇÃO 01 — SECURITY HARDENING (EXECUÇÃO MANUAL)
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Revise este arquivo e faça backup antes de executar.
-- 2. No painel do Supabase, abra SQL Editor > New query.
-- 3. Cole TODO o conteúdo, execute uma única vez e confira os NOTICE/erros.
-- 4. O script é idempotente: buckets são atualizados e políticas/função são
--    recriadas com nomes determinísticos.
-- 5. NÃO execute parcialmente. A transação reverte tudo se uma etapa falhar.
-- 6. Este arquivo NÃO é aplicado automaticamente e não faz deploy de funções.
--
-- DEPENDÊNCIAS DE SCHEMA (revisar antes de executar):
-- - public.clinic_users(clinic_id, user_id, is_owner), public.user_roles(role)
-- - public.clinic_role_permissions e as três tabelas de papéis customizados
-- - public.is_superadmin(uuid)
-- - patients e financial_transactions precisam possuir clinic_id
-- - financial_transactions precisa possuir user_id
-- - user_notifications precisa possuir user_id e clinic_id
-- - paths atuais: clinic-documents/{clinic_id}/... e
--   support-attachments/{user_id}/...
-- Se o schema de produção divergir, ajuste somente a seção correspondente.
-- ============================================================================

BEGIN;

-- 0. Desabilitar definitivamente o auto-provisionamento/trial legado.
-- Novos clientes são criados apenas pela Edge Function create-complete-client.
DROP TRIGGER IF EXISTS on_auth_user_create_clinic ON auth.users;
DROP FUNCTION IF EXISTS public.create_clinic_on_signup();

-- 1. Buckets privados (UPDATE também corrige buckets criados como públicos).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'clinic-documents',
    'clinic-documents',
    false,
    10485760,
    ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
  ),
  (
    'support-attachments',
    'support-attachments',
    false,
    10485760,
    ARRAY[
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'video/mp4',
      'video/quicktime'
    ]
  )
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2. Storage: remover políticas amplas/legadas antes de recriar as restritas.
DROP POLICY IF EXISTS "Authenticated users can upload clinic documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view clinic documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete clinic documents" ON storage.objects;
DROP POLICY IF EXISTS "Clinic members can read clinic documents by path" ON storage.objects;
DROP POLICY IF EXISTS "Clinic members can insert clinic documents by path" ON storage.objects;
DROP POLICY IF EXISTS "Clinic members can update clinic documents by path" ON storage.objects;
DROP POLICY IF EXISTS "Clinic members can delete clinic documents by path" ON storage.objects;

CREATE POLICY "Clinic members can read clinic documents by path"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'clinic-documents'
  AND (
    EXISTS (
      SELECT 1
      FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.clinic_id::text = (storage.foldername(name))[1]
    )
    OR public.is_superadmin(auth.uid())
  )
);

CREATE POLICY "Clinic members can insert clinic documents by path"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'clinic-documents'
  AND (
    EXISTS (
      SELECT 1
      FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.clinic_id::text = (storage.foldername(name))[1]
    )
    OR public.is_superadmin(auth.uid())
  )
);

CREATE POLICY "Clinic members can update clinic documents by path"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'clinic-documents'
  AND (
    EXISTS (
      SELECT 1 FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.clinic_id::text = (storage.foldername(name))[1]
    )
    OR public.is_superadmin(auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'clinic-documents'
  AND (
    EXISTS (
      SELECT 1 FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.clinic_id::text = (storage.foldername(name))[1]
    )
    OR public.is_superadmin(auth.uid())
  )
);

CREATE POLICY "Clinic members can delete clinic documents by path"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'clinic-documents'
  AND (
    EXISTS (
      SELECT 1 FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.clinic_id::text = (storage.foldername(name))[1]
    )
    OR public.is_superadmin(auth.uid())
  )
);

DROP POLICY IF EXISTS "Authenticated users can upload support attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view their support attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view support attachments" ON storage.objects;
DROP POLICY IF EXISTS "SuperAdmins can manage all support attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own support attachments by path" ON storage.objects;
DROP POLICY IF EXISTS "Users can insert own support attachments by path" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own support attachments by path" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own support attachments by path" ON storage.objects;

CREATE POLICY "Users can read own support attachments by path"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_superadmin(auth.uid())
  )
);

CREATE POLICY "Users can insert own support attachments by path"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'support-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own support attachments by path"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_superadmin(auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'support-attachments'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_superadmin(auth.uid())
  )
);

CREATE POLICY "Users can delete own support attachments by path"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_superadmin(auth.uid())
  )
);

-- 3. Helper de autorização para tabelas por clínica.
-- Depende da matriz criada em 20260214000000_clinic_role_permissions.sql.
-- Compatibilidade: para papel de sistema sem qualquer configuração na clínica,
-- mantém o fallback atual do frontend ("full"). Papel customizado exige permissão
-- explícita, proprietário/admin e superadmin permanecem com acesso integral.
CREATE OR REPLACE FUNCTION public.user_can_clinic_action(
  p_clinic_id uuid,
  p_feature text,
  p_action text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_custom_role_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_action NOT IN ('can_view', 'can_create', 'can_edit', 'can_delete') THEN
    RETURN false;
  END IF;

  IF public.is_superadmin(auth.uid()) THEN
    RETURN true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_users cu
    WHERE cu.user_id = auth.uid() AND cu.clinic_id = p_clinic_id
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clinic_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.clinic_id = p_clinic_id
      AND cu.is_owner = true
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'
  ) THEN
    RETURN true;
  END IF;

  SELECT uccr.clinic_custom_role_id
  INTO v_custom_role_id
  FROM public.user_clinic_custom_roles uccr
  WHERE uccr.user_id = auth.uid() AND uccr.clinic_id = p_clinic_id
  LIMIT 1;

  IF v_custom_role_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.clinic_custom_role_permissions p
      WHERE p.clinic_custom_role_id = v_custom_role_id
        AND p.feature = p_feature
        AND CASE p_action
          WHEN 'can_view' THEN p.can_view
          WHEN 'can_create' THEN p.can_create
          WHEN 'can_edit' THEN p.can_edit
          WHEN 'can_delete' THEN p.can_delete
          ELSE false
        END
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clinic_role_permissions p
    JOIN public.user_roles ur ON ur.role::text = p.role
    WHERE ur.user_id = auth.uid() AND p.clinic_id = p_clinic_id
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.clinic_role_permissions p
    JOIN public.user_roles ur ON ur.role::text = p.role
    WHERE ur.user_id = auth.uid()
      AND p.clinic_id = p_clinic_id
      AND p.feature = p_feature
      AND CASE p_action
        WHEN 'can_view' THEN p.can_view
        WHEN 'can_create' THEN p.can_create
        WHEN 'can_edit' THEN p.can_edit
        WHEN 'can_delete' THEN p.can_delete
        ELSE false
      END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.user_can_clinic_action(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_clinic_action(uuid, text, text) TO authenticated, service_role;

-- 4. user_notifications: remove INSERT irrestrito.
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "System can insert notifications" ON public.user_notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.user_notifications;
-- Não existe INSERT direto para authenticated. A RPC SECURITY DEFINER
-- notify_clinic_users_on_appointment e service_role continuam aptas a inserir.

-- 5. profiles: remove poderes globais do papel admin e limita à mesma clínica.
-- profiles não possui clinic_id; por isso o vínculo é inferido por clinic_users.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin can delete clinic users" ON public.profiles;
DROP POLICY IF EXISTS "Clinic members can view profiles in same clinic" ON public.profiles;
DROP POLICY IF EXISTS "Clinic admins can insert profiles in same clinic" ON public.profiles;
DROP POLICY IF EXISTS "Clinic admins can update profiles in same clinic" ON public.profiles;
DROP POLICY IF EXISTS "Clinic admins can delete profiles in same clinic" ON public.profiles;

CREATE POLICY "Clinic members can view profiles in same clinic"
ON public.profiles FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_superadmin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.clinic_users target_cu
    JOIN public.clinic_users actor_cu ON actor_cu.clinic_id = target_cu.clinic_id
    WHERE target_cu.user_id = profiles.user_id
      AND actor_cu.user_id = auth.uid()
  )
);

CREATE POLICY "Clinic admins can insert profiles in same clinic"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.clinic_users target_cu
    JOIN public.clinic_users actor_cu ON actor_cu.clinic_id = target_cu.clinic_id
    WHERE target_cu.user_id = profiles.user_id
      AND actor_cu.user_id = auth.uid()
      AND (
        actor_cu.is_owner = true
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'
        )
      )
  )
);

CREATE POLICY "Clinic admins can update profiles in same clinic"
ON public.profiles FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_superadmin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.clinic_users target_cu
    JOIN public.clinic_users actor_cu ON actor_cu.clinic_id = target_cu.clinic_id
    WHERE target_cu.user_id = profiles.user_id
      AND actor_cu.user_id = auth.uid()
      AND (
        actor_cu.is_owner = true
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'
        )
      )
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_superadmin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.clinic_users target_cu
    JOIN public.clinic_users actor_cu ON actor_cu.clinic_id = target_cu.clinic_id
    WHERE target_cu.user_id = profiles.user_id
      AND actor_cu.user_id = auth.uid()
      AND (
        actor_cu.is_owner = true
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'
        )
      )
  )
);

CREATE POLICY "Clinic admins can delete profiles in same clinic"
ON public.profiles FOR DELETE TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.clinic_users target_cu
    JOIN public.clinic_users actor_cu ON actor_cu.clinic_id = target_cu.clinic_id
    WHERE target_cu.user_id = profiles.user_id
      AND actor_cu.user_id = auth.uid()
      AND actor_cu.user_id <> profiles.user_id
      AND (
        actor_cu.is_owner = true
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'
        )
      )
  )
);

-- 6. patients: membership + matriz de permissões da feature pacientes.
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view clinic patients with feature" ON public.patients;
DROP POLICY IF EXISTS "Users can insert clinic patients with feature" ON public.patients;
DROP POLICY IF EXISTS "Users can insert clinic patients with feature or admin" ON public.patients;
DROP POLICY IF EXISTS "Users can update clinic patients with feature" ON public.patients;
DROP POLICY IF EXISTS "Users can delete clinic patients with feature" ON public.patients;
DROP POLICY IF EXISTS "Users can view clinic patients" ON public.patients;
DROP POLICY IF EXISTS "Users can insert clinic patients" ON public.patients;
DROP POLICY IF EXISTS "Users can update clinic patients" ON public.patients;
DROP POLICY IF EXISTS "Users can delete clinic patients" ON public.patients;

CREATE POLICY "Users can view clinic patients"
ON public.patients FOR SELECT TO authenticated
USING (public.user_can_clinic_action(clinic_id, 'pacientes', 'can_view'));

CREATE POLICY "Users can insert clinic patients"
ON public.patients FOR INSERT TO authenticated
WITH CHECK (public.user_can_clinic_action(clinic_id, 'pacientes', 'can_create'));

CREATE POLICY "Users can update clinic patients"
ON public.patients FOR UPDATE TO authenticated
USING (public.user_can_clinic_action(clinic_id, 'pacientes', 'can_edit'))
WITH CHECK (public.user_can_clinic_action(clinic_id, 'pacientes', 'can_edit'));

CREATE POLICY "Users can delete clinic patients"
ON public.patients FOR DELETE TO authenticated
USING (public.user_can_clinic_action(clinic_id, 'pacientes', 'can_delete'));

-- 7. financial_transactions: membership + matriz da feature financeiro.
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view clinic transactions with feature" ON public.financial_transactions;
DROP POLICY IF EXISTS "Users can insert transactions with feature" ON public.financial_transactions;
DROP POLICY IF EXISTS "Users can update transactions with feature" ON public.financial_transactions;
DROP POLICY IF EXISTS "Users can view clinic transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Users can insert clinic transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Users can update clinic transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Users can delete clinic transactions" ON public.financial_transactions;

CREATE POLICY "Users can view clinic transactions"
ON public.financial_transactions FOR SELECT TO authenticated
USING (public.user_can_clinic_action(clinic_id, 'financeiro', 'can_view'));

CREATE POLICY "Users can insert clinic transactions"
ON public.financial_transactions FOR INSERT TO authenticated
WITH CHECK (
  public.user_can_clinic_action(clinic_id, 'financeiro', 'can_create')
  AND user_id = auth.uid()
);

CREATE POLICY "Users can update clinic transactions"
ON public.financial_transactions FOR UPDATE TO authenticated
USING (public.user_can_clinic_action(clinic_id, 'financeiro', 'can_edit'))
WITH CHECK (public.user_can_clinic_action(clinic_id, 'financeiro', 'can_edit'));

CREATE POLICY "Users can delete clinic transactions"
ON public.financial_transactions FOR DELETE TO authenticated
USING (public.user_can_clinic_action(clinic_id, 'financeiro', 'can_delete'));

-- 8. Tokens Meta nunca podem trafegar pelo PostgREST/browser.
-- Leitura autenticada fica limitada às colunas não sensíveis. Criação e
-- atualização de canal passam pela Edge Function meta-save-channel.
REVOKE ALL PRIVILEGES ON public.chat_channels FROM anon, authenticated;
GRANT SELECT (
  id,
  clinic_id,
  channel_type,
  display_name,
  phone_number,
  waba_id,
  phone_number_id,
  status,
  metadata,
  created_at,
  updated_at
) ON public.chat_channels TO authenticated;

COMMIT;

-- VALIDAÇÃO MANUAL APÓS EXECUTAR:
-- SELECT id, public FROM storage.buckets
-- WHERE id IN ('clinic-documents', 'support-attachments');
--
-- SELECT schemaname, tablename, policyname, cmd
-- FROM pg_policies
-- WHERE (schemaname = 'storage' AND tablename = 'objects')
--    OR (schemaname = 'public' AND tablename IN
--        ('user_notifications', 'profiles', 'patients', 'financial_transactions'))
-- ORDER BY schemaname, tablename, policyname;

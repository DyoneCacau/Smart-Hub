-- ============================================================
-- FIX: Termos e Documentos (403 Forbidden)
-- Execute no Supabase: SQL Editor > New Query > Cole e Execute
-- ============================================================
-- Corrige RLS das tabelas terms e clinic_documents.
-- Permite admin/superadmin criar termos e enviar documentos mesmo sem feature.

-- 0a. Corrigir RLS terms (permite admin/superadmin criar termos)
DROP POLICY IF EXISTS "Users can view clinic terms with feature" ON public.terms;
DROP POLICY IF EXISTS "Users can manage clinic terms with feature" ON public.terms;
DROP POLICY IF EXISTS "Superadmins can manage all terms" ON public.terms;

CREATE POLICY "Users can view clinic terms with feature"
ON public.terms FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND (
    (SELECT public.user_has_feature(auth.uid(), 'termos'))
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'superadmin'))
  )
);

CREATE POLICY "Users can manage clinic terms with feature"
ON public.terms FOR ALL
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND (
    (SELECT public.user_has_feature(auth.uid(), 'termos'))
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'superadmin'))
  )
);

CREATE POLICY "Superadmins can manage all terms"
ON public.terms FOR ALL
USING (public.is_superadmin(auth.uid()));

-- 0b. Corrigir RLS clinic_documents (permite admin/superadmin mesmo sem feature termos)
DROP POLICY IF EXISTS "Users can view clinic documents" ON public.clinic_documents;
DROP POLICY IF EXISTS "Users can manage clinic documents" ON public.clinic_documents;
DROP POLICY IF EXISTS "Superadmins can manage all clinic documents" ON public.clinic_documents;

CREATE POLICY "Users can view clinic documents"
ON public.clinic_documents FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND (
    (SELECT public.user_has_feature(auth.uid(), 'termos'))
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'superadmin'))
  )
);

CREATE POLICY "Users can manage clinic documents"
ON public.clinic_documents FOR ALL
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND (
    (SELECT public.user_has_feature(auth.uid(), 'termos'))
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'superadmin'))
  )
);

CREATE POLICY "Superadmins can manage all clinic documents"
ON public.clinic_documents FOR ALL
USING (public.is_superadmin(auth.uid()));

-- 1. Criar ou atualizar o bucket clinic-documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinic-documents',
  'clinic-documents',
  true,
  10485760,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml'
  ];

-- 2. Garantir politicas de storage para upload
DROP POLICY IF EXISTS "Authenticated users can upload clinic documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view clinic documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete clinic documents" ON storage.objects;

CREATE POLICY "Authenticated users can upload clinic documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'clinic-documents');

CREATE POLICY "Authenticated users can view clinic documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'clinic-documents');

CREATE POLICY "Authenticated users can delete clinic documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'clinic-documents');

-- ============================================================
-- SCRIPT: Termos e Documentos (Razao Social, clinic_documents, Storage)
-- Execute no Supabase: SQL Editor > New Query > Cole e Execute
-- ============================================================

-- 1. Razao social e cor principal na tabela clinics
ALTER TABLE public.clinics
ADD COLUMN IF NOT EXISTS razao_social TEXT;

ALTER TABLE public.clinics
ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#0ea5e9';

-- 2. Tabela clinic_documents
CREATE TABLE IF NOT EXISTS public.clinic_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('atestado', 'declaracao', 'termo_ciencia', 'recibo', 'receituario', 'outro')),
  file_url TEXT,
  content TEXT,
  is_upload BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinic_documents_clinic_id ON public.clinic_documents(clinic_id);

ALTER TABLE public.clinic_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view clinic documents" ON public.clinic_documents;
DROP POLICY IF EXISTS "Users can manage clinic documents" ON public.clinic_documents;
DROP POLICY IF EXISTS "Superadmins can manage all clinic documents" ON public.clinic_documents;

CREATE POLICY "Users can view clinic documents"
ON public.clinic_documents FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND (SELECT user_has_feature(auth.uid(), 'termos'))
);

CREATE POLICY "Users can manage clinic documents"
ON public.clinic_documents FOR ALL
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND (SELECT user_has_feature(auth.uid(), 'termos'))
);

CREATE POLICY "Superadmins can manage all clinic documents"
ON public.clinic_documents FOR ALL
USING (is_superadmin(auth.uid()));

DROP TRIGGER IF EXISTS update_clinic_documents_updated_at ON public.clinic_documents;
CREATE TRIGGER update_clinic_documents_updated_at
  BEFORE UPDATE ON public.clinic_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinic-documents',
  'clinic-documents',
  true,
  10485760,
  ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760;

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

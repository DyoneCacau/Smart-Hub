-- Razao social para recibo (Configuracao > Dados da Clinica)
ALTER TABLE public.clinics
ADD COLUMN IF NOT EXISTS razao_social TEXT;

-- Tabela de documentos/modelos da clinica
CREATE TABLE IF NOT EXISTS public.clinic_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('atestado', 'declaracao', 'termo_ciencia', 'recibo', 'outro')),
  file_url TEXT,
  content TEXT,
  is_upload BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinic_documents_clinic_id ON public.clinic_documents(clinic_id);

ALTER TABLE public.clinic_documents ENABLE ROW LEVEL SECURITY;

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

CREATE TRIGGER update_clinic_documents_updated_at
  BEFORE UPDATE ON public.clinic_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket para documentos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinic-documents',
  'clinic-documents',
  false,
  10485760,
  ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload clinic documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'clinic-documents');

CREATE POLICY "Authenticated users can view clinic documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'clinic-documents');

CREATE POLICY "Authenticated users can delete clinic documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'clinic-documents');

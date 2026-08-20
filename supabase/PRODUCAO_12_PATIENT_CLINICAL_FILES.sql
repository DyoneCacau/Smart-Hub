-- ============================================================
-- SCRIPT: Galeria clínica do paciente (fotos / raio-X / docs)
-- Execute no Supabase: SQL Editor > New Query > Cole e Execute
--
-- O que este script faz:
-- 1) Cria a tabela patient_files (metadados + vínculo a dente/evolução)
-- 2) Cria o bucket privado patient-files
-- 3) RLS para membros da clínica + superadmin
--
-- Path dos arquivos: patient-files/{clinic_id}/{patient_id}/...
-- NÃO sobe com o frontend (Vercel). Rode este SQL antes de usar em produção.
-- ============================================================

-- 1) Tabela patient_files
CREATE TABLE IF NOT EXISTS public.patient_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  evolution_id UUID REFERENCES public.patient_evolutions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size BIGINT NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'outro'
    CHECK (category IN ('radiografia', 'foto', 'documento', 'outro')),
  notes TEXT NOT NULL DEFAULT '',
  tooth_number INTEGER,
  rotation INTEGER NOT NULL DEFAULT 0
    CHECK (rotation IN (0, 90, 180, 270)),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_files_patient_id
  ON public.patient_files(patient_id);

CREATE INDEX IF NOT EXISTS idx_patient_files_clinic_id
  ON public.patient_files(clinic_id);

CREATE INDEX IF NOT EXISTS idx_patient_files_evolution_id
  ON public.patient_files(evolution_id);

CREATE INDEX IF NOT EXISTS idx_patient_files_tooth_number
  ON public.patient_files(tooth_number);

ALTER TABLE public.patient_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view clinic patient files" ON public.patient_files;
DROP POLICY IF EXISTS "Users can insert clinic patient files" ON public.patient_files;
DROP POLICY IF EXISTS "Users can update clinic patient files" ON public.patient_files;
DROP POLICY IF EXISTS "Users can delete clinic patient files" ON public.patient_files;
DROP POLICY IF EXISTS "Superadmins can manage all patient files" ON public.patient_files;

CREATE POLICY "Users can view clinic patient files"
ON public.patient_files FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert clinic patient files"
ON public.patient_files FOR INSERT
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update clinic patient files"
ON public.patient_files FOR UPDATE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
)
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete clinic patient files"
ON public.patient_files FOR DELETE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Superadmins can manage all patient files"
ON public.patient_files FOR ALL
USING (is_superadmin(auth.uid()));

DROP TRIGGER IF EXISTS update_patient_files_updated_at ON public.patient_files;
CREATE TRIGGER update_patient_files_updated_at
  BEFORE UPDATE ON public.patient_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Bucket privado
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-files',
  'patient-files',
  false,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3) Storage policies (path: {clinic_id}/{patient_id}/arquivo)
DROP POLICY IF EXISTS "Clinic members can read patient files by path" ON storage.objects;
DROP POLICY IF EXISTS "Clinic members can insert patient files by path" ON storage.objects;
DROP POLICY IF EXISTS "Clinic members can update patient files by path" ON storage.objects;
DROP POLICY IF EXISTS "Clinic members can delete patient files by path" ON storage.objects;
DROP POLICY IF EXISTS "Superadmins can manage all patient files storage" ON storage.objects;

CREATE POLICY "Clinic members can read patient files by path"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'patient-files'
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

CREATE POLICY "Clinic members can insert patient files by path"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'patient-files'
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

CREATE POLICY "Clinic members can update patient files by path"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'patient-files'
  AND (
    EXISTS (
      SELECT 1
      FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.clinic_id::text = (storage.foldername(name))[1]
    )
    OR public.is_superadmin(auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'patient-files'
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

CREATE POLICY "Clinic members can delete patient files by path"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'patient-files'
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

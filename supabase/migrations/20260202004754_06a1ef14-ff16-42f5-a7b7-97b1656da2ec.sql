
-- Create patients table
CREATE TABLE public.patients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cpf TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  birth_date DATE,
  clinical_notes TEXT,
  allergies TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create appointments table
CREATE TABLE public.appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  procedure TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  seller_id UUID,
  lead_source TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create dental_charts table for tooth records
CREATE TABLE public.dental_charts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  tooth_number INTEGER NOT NULL,
  condition TEXT NOT NULL DEFAULT 'healthy',
  notes TEXT,
  treatment_date DATE,
  professional_id UUID REFERENCES public.professionals(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create terms table for consent forms
CREATE TABLE public.terms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'consent',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create signed_terms table for patient signatures
CREATE TABLE public.signed_terms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  signed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  signature_data TEXT,
  ip_address TEXT
);

-- Enable RLS on all tables
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dental_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signed_terms ENABLE ROW LEVEL SECURITY;

-- Patients RLS policies
CREATE POLICY "Users can view clinic patients with feature"
ON public.patients FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND user_has_feature(auth.uid(), 'pacientes')
);

CREATE POLICY "Users can insert clinic patients with feature"
ON public.patients FOR INSERT
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND user_has_feature(auth.uid(), 'pacientes')
);

CREATE POLICY "Users can update clinic patients with feature"
ON public.patients FOR UPDATE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND user_has_feature(auth.uid(), 'pacientes')
);

CREATE POLICY "Users can delete clinic patients with feature"
ON public.patients FOR DELETE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND user_has_feature(auth.uid(), 'pacientes')
);

CREATE POLICY "Superadmins can manage all patients"
ON public.patients FOR ALL
USING (is_superadmin(auth.uid()));

-- Appointments RLS policies
CREATE POLICY "Users can view clinic appointments with feature"
ON public.appointments FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND user_has_feature(auth.uid(), 'agenda')
);

CREATE POLICY "Users can insert clinic appointments with feature"
ON public.appointments FOR INSERT
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND user_has_feature(auth.uid(), 'agenda')
);

CREATE POLICY "Users can update clinic appointments with feature"
ON public.appointments FOR UPDATE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND user_has_feature(auth.uid(), 'agenda')
);

CREATE POLICY "Users can delete clinic appointments with feature"
ON public.appointments FOR DELETE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND user_has_feature(auth.uid(), 'agenda')
);

CREATE POLICY "Superadmins can manage all appointments"
ON public.appointments FOR ALL
USING (is_superadmin(auth.uid()));

-- Dental charts RLS policies
CREATE POLICY "Users can view clinic dental charts with feature"
ON public.dental_charts FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND user_has_feature(auth.uid(), 'pacientes')
);

CREATE POLICY "Users can manage clinic dental charts with feature"
ON public.dental_charts FOR ALL
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND user_has_feature(auth.uid(), 'pacientes')
);

CREATE POLICY "Superadmins can manage all dental charts"
ON public.dental_charts FOR ALL
USING (is_superadmin(auth.uid()));

-- Terms RLS policies
CREATE POLICY "Users can view clinic terms with feature"
ON public.terms FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND user_has_feature(auth.uid(), 'termos')
);

CREATE POLICY "Users can manage clinic terms with feature"
ON public.terms FOR ALL
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  AND user_has_feature(auth.uid(), 'termos')
);

CREATE POLICY "Superadmins can manage all terms"
ON public.terms FOR ALL
USING (is_superadmin(auth.uid()));

-- Signed terms RLS policies
CREATE POLICY "Users can view clinic signed terms"
ON public.signed_terms FOR SELECT
USING (
  term_id IN (
    SELECT id FROM public.terms WHERE clinic_id IN (
      SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can insert signed terms"
ON public.signed_terms FOR INSERT
WITH CHECK (
  term_id IN (
    SELECT id FROM public.terms WHERE clinic_id IN (
      SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Superadmins can manage all signed terms"
ON public.signed_terms FOR ALL
USING (is_superadmin(auth.uid()));

-- Create triggers for updated_at
CREATE TRIGGER update_patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dental_charts_updated_at
  BEFORE UPDATE ON public.dental_charts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_terms_updated_at
  BEFORE UPDATE ON public.terms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_patients_clinic_id ON public.patients(clinic_id);
CREATE INDEX idx_appointments_clinic_id ON public.appointments(clinic_id);
CREATE INDEX idx_appointments_date ON public.appointments(date);
CREATE INDEX idx_appointments_patient_id ON public.appointments(patient_id);
CREATE INDEX idx_dental_charts_patient_id ON public.dental_charts(patient_id);
CREATE INDEX idx_terms_clinic_id ON public.terms(clinic_id);

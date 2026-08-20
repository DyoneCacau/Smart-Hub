-- Support Tickets System
-- Allows clinic users to send support messages to the superadmin

CREATE TABLE public.support_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'request',
  -- types: 'request', 'bug', 'billing', 'feature', 'other'
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  -- statuses: 'open', 'in_progress', 'resolved', 'closed'
  priority TEXT NOT NULL DEFAULT 'normal',
  -- priorities: 'low', 'normal', 'high', 'urgent'
  admin_reply TEXT,
  admin_replied_at TIMESTAMPTZ,
  admin_replied_by UUID REFERENCES auth.users(id),
  attachments JSONB DEFAULT '[]'::jsonb,
  -- [{name, url, type, size}]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_support_ticket_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_support_ticket_updated_at();

-- RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Clinics can see their own tickets
CREATE POLICY "Clinic users can view own tickets"
  ON public.support_tickets
  FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()
    )
  );

-- Clinic users can create tickets
CREATE POLICY "Clinic users can create tickets"
  ON public.support_tickets
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()
    )
  );

-- SuperAdmins can view and manage all tickets
CREATE POLICY "SuperAdmins can manage all tickets"
  ON public.support_tickets
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'superadmin'
    )
  );

-- Indexes
CREATE INDEX idx_support_tickets_clinic_id ON public.support_tickets(clinic_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX idx_support_tickets_created_at ON public.support_tickets(created_at DESC);
CREATE INDEX idx_support_tickets_user_id ON public.support_tickets(user_id);

-- Storage bucket for support attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-attachments',
  'support-attachments',
  false,
  10485760, -- 10MB
  ARRAY['image/jpeg','image/png','image/gif','image/webp','application/pdf','video/mp4','video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload support attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'support-attachments');

CREATE POLICY "Authenticated users can view their support attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'support-attachments');

CREATE POLICY "SuperAdmins can manage all support attachments"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'support-attachments' AND
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'superadmin'
    )
  );

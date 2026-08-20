-- Tabela user_notifications + RLS + RPC para notificações de agendamento cross-clínica
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'appointment_created',
  title TEXT NOT NULL,
  message TEXT,
  reference_id UUID,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON public.user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_is_read ON public.user_notifications(user_id, is_read);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.user_notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON public.user_notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own notifications" ON public.user_notifications
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications" ON public.user_notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Superadmins full access notifications" ON public.user_notifications
  FOR ALL USING (public.is_superadmin(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;

CREATE OR REPLACE FUNCTION public.notify_clinic_users_on_appointment(
  p_clinic_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_reference_id UUID,
  p_creator_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_notifications (user_id, clinic_id, type, title, message, reference_id)
  SELECT
    cu.user_id,
    p_clinic_id,
    'appointment_created',
    p_title,
    p_message,
    p_reference_id
  FROM public.clinic_users cu
  WHERE cu.clinic_id = p_clinic_id
    AND cu.user_id != p_creator_id;
END;
$$;

-- ============================================================================
-- MÓDULO ATENDIMENTO — Omnichannel (WhatsApp / expansível)
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Execute este script no SQL Editor do Supabase OU via: supabase db push
-- 2. Após aplicar, configure secrets das Edge Functions meta-webhook e meta-send-message
-- 3. Habilite a feature "atendimento" no plano da clínica (SuperAdmin > Planos)
-- ============================================================================

-- Canais conectados por clínica (WhatsApp hoje; Instagram/Messenger no futuro)
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel_type IN ('whatsapp', 'instagram', 'messenger', 'webchat')),
  display_name TEXT NOT NULL,
  phone_number TEXT,
  waba_id TEXT,
  phone_number_id TEXT,
  access_token TEXT,
  webhook_verify_token TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disconnected', 'error')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, channel_type, phone_number_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_channels_clinic ON public.chat_channels(clinic_id);

-- Fluxos de atendimento (bot + encaminhamento humano)
CREATE TABLE IF NOT EXISTS public.chat_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.chat_channels(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  trigger_type TEXT NOT NULL DEFAULT 'incoming' CHECK (trigger_type IN ('incoming', 'keyword', 'manual')),
  definition JSONB NOT NULL DEFAULT '{"version":1,"nodes":[],"edges":[]}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_flows_clinic ON public.chat_flows(clinic_id);

-- Conversas / tickets de atendimento
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  flow_id UUID REFERENCES public.chat_flows(id) ON DELETE SET NULL,
  external_contact_id TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'waiting_human', 'closed')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_preview TEXT,
  unread_count INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id, external_contact_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_clinic_status ON public.chat_conversations(clinic_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_assigned ON public.chat_conversations(assigned_to) WHERE assigned_to IS NOT NULL;

-- Mensagens
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'system')),
  body TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'audio', 'document', 'template', 'system')),
  external_id TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'pending', 'sent', 'delivered', 'read', 'failed')),
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON public.chat_messages(conversation_id, created_at);

-- Sessão ativa de fluxo por conversa
CREATE TABLE IF NOT EXISTS public.chat_flow_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  flow_id UUID NOT NULL REFERENCES public.chat_flows(id) ON DELETE CASCADE,
  current_node_id TEXT,
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_flow_sessions_active
  ON public.chat_flow_sessions(conversation_id) WHERE is_active = true;

-- Realtime para inbox
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;

-- RLS
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_flow_sessions ENABLE ROW LEVEL SECURITY;

-- Helper: membro da clínica
CREATE OR REPLACE FUNCTION public.user_belongs_to_clinic(p_clinic_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_users cu
    WHERE cu.user_id = auth.uid() AND cu.clinic_id = p_clinic_id
  ) OR public.is_superadmin(auth.uid());
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- chat_channels
CREATE POLICY "Clinic members can view channels"
ON public.chat_channels FOR SELECT
USING (public.user_belongs_to_clinic(clinic_id) AND public.user_has_feature(auth.uid(), 'atendimento'));

CREATE POLICY "Clinic admins can manage channels"
ON public.chat_channels FOR ALL
USING (
  public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'atendimento')
  AND (
    EXISTS (
      SELECT 1 FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid() AND cu.clinic_id = chat_channels.clinic_id AND cu.is_owner = true
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  )
)
WITH CHECK (
  public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'atendimento')
);

CREATE POLICY "Superadmins manage all channels"
ON public.chat_channels FOR ALL
USING (public.is_superadmin(auth.uid()));

-- chat_flows
CREATE POLICY "Clinic members can view flows"
ON public.chat_flows FOR SELECT
USING (public.user_belongs_to_clinic(clinic_id) AND public.user_has_feature(auth.uid(), 'atendimento'));

CREATE POLICY "Clinic members can manage flows"
ON public.chat_flows FOR ALL
USING (public.user_belongs_to_clinic(clinic_id) AND public.user_has_feature(auth.uid(), 'atendimento'))
WITH CHECK (public.user_belongs_to_clinic(clinic_id) AND public.user_has_feature(auth.uid(), 'atendimento'));

CREATE POLICY "Superadmins manage all flows"
ON public.chat_flows FOR ALL
USING (public.is_superadmin(auth.uid()));

-- chat_conversations
CREATE POLICY "Clinic members can view conversations"
ON public.chat_conversations FOR SELECT
USING (public.user_belongs_to_clinic(clinic_id) AND public.user_has_feature(auth.uid(), 'atendimento'));

CREATE POLICY "Clinic members can manage conversations"
ON public.chat_conversations FOR ALL
USING (public.user_belongs_to_clinic(clinic_id) AND public.user_has_feature(auth.uid(), 'atendimento'))
WITH CHECK (public.user_belongs_to_clinic(clinic_id) AND public.user_has_feature(auth.uid(), 'atendimento'));

CREATE POLICY "Superadmins manage all conversations"
ON public.chat_conversations FOR ALL
USING (public.is_superadmin(auth.uid()));

-- chat_messages
CREATE POLICY "Clinic members can view messages"
ON public.chat_messages FOR SELECT
USING (public.user_belongs_to_clinic(clinic_id) AND public.user_has_feature(auth.uid(), 'atendimento'));

CREATE POLICY "Clinic members can insert outbound messages"
ON public.chat_messages FOR INSERT
WITH CHECK (
  public.user_belongs_to_clinic(clinic_id)
  AND public.user_has_feature(auth.uid(), 'atendimento')
  AND direction IN ('outbound', 'system')
);

CREATE POLICY "Superadmins manage all messages"
ON public.chat_messages FOR ALL
USING (public.is_superadmin(auth.uid()));

-- chat_flow_sessions
CREATE POLICY "Clinic members can manage flow sessions"
ON public.chat_flow_sessions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.chat_conversations c
    WHERE c.id = chat_flow_sessions.conversation_id
    AND public.user_belongs_to_clinic(c.clinic_id)
    AND public.user_has_feature(auth.uid(), 'atendimento')
  )
);

CREATE POLICY "Superadmins manage all flow sessions"
ON public.chat_flow_sessions FOR ALL
USING (public.is_superadmin(auth.uid()));

COMMENT ON TABLE public.chat_channels IS 'Canais omnichannel conectados por clínica (WhatsApp Cloud API, etc.)';
COMMENT ON TABLE public.chat_flows IS 'Fluxos de atendimento automatizado';
COMMENT ON TABLE public.chat_conversations IS 'Conversas centralizadas no inbox de atendimento';
COMMENT ON TABLE public.chat_messages IS 'Mensagens inbound/outbound das conversas';

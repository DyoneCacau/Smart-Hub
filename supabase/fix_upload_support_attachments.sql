-- ============================================================
-- FIX: Tickets de Suporte e upload de anexos
-- Execute no Supabase: SQL Editor > New Query > Cole e Execute
-- ============================================================
-- Corrige RLS de support_tickets e do bucket support-attachments
-- para que usuários possam enviar tickets (com ou sem anexos).

-- 0a. Corrigir RLS support_tickets (usa is_clinic_member para evitar recursão RLS)
DROP POLICY IF EXISTS "Clinic users can create tickets" ON public.support_tickets;

CREATE POLICY "Clinic users can create tickets"
  ON public.support_tickets FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_clinic_member(auth.uid(), clinic_id)
  );

-- 0b. Permitir que usuários criem notificações para o admin (ao abrir ticket)
DROP POLICY IF EXISTS "Authenticated users can create admin notifications" ON public.admin_notifications;

CREATE POLICY "Authenticated users can create admin notifications"
  ON public.admin_notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 1. Criar ou atualizar o bucket support-attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-attachments',
  'support-attachments',
  false,
  10485760,  -- 10MB
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
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'video/mp4',
    'video/quicktime'
  ];

-- 2. Remover políticas antigas que possam conflitar
DROP POLICY IF EXISTS "Authenticated users can upload support attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view their support attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view support attachments" ON storage.objects;
DROP POLICY IF EXISTS "SuperAdmins can manage all support attachments" ON storage.objects;

-- 3. Políticas de storage para support-attachments
-- Usuários autenticados podem fazer upload (para enviar comprovantes, etc.)
CREATE POLICY "Authenticated users can upload support attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'support-attachments');

-- Usuários autenticados podem visualizar (para ver seus próprios anexos)
CREATE POLICY "Authenticated users can view support attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'support-attachments');

-- SuperAdmins podem gerenciar todos os anexos
CREATE POLICY "SuperAdmins can manage all support attachments"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'superadmin'
    )
  );

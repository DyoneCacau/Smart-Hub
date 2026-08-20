-- Restringe notify Smart Hub booking a service_role + índice anti-duplicata.
-- Equivalente operacional: supabase/PRODUCAO_41_SMART_HUB_BOOKING_NOTIFY.sql
-- Preferir execução manual do PRODUCAO_41 no SQL Editor em produção.

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_notifications_smart_hub_booking
  ON public.user_notifications (clinic_id, reference_id, user_id)
  WHERE type = 'appointment_created'
    AND reference_id IS NOT NULL
    AND COALESCE(metadata->>'source', '') = 'smart_hub';

CREATE OR REPLACE FUNCTION public.user_can_clinic_action_as(
  p_user_id uuid,
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
  IF p_user_id IS NULL OR p_action NOT IN ('can_view', 'can_create', 'can_edit', 'can_delete') THEN
    RETURN false;
  END IF;

  IF public.is_superadmin(p_user_id) THEN
    RETURN true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_users cu
    WHERE cu.user_id = p_user_id AND cu.clinic_id = p_clinic_id
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clinic_users cu
    WHERE cu.user_id = p_user_id
      AND cu.clinic_id = p_clinic_id
      AND cu.is_owner = true
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_user_id AND ur.role::text = 'admin'
  ) THEN
    RETURN true;
  END IF;

  SELECT uccr.clinic_custom_role_id
  INTO v_custom_role_id
  FROM public.user_clinic_custom_roles uccr
  WHERE uccr.user_id = p_user_id AND uccr.clinic_id = p_clinic_id
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
    WHERE ur.user_id = p_user_id AND p.clinic_id = p_clinic_id
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.clinic_role_permissions p
    JOIN public.user_roles ur ON ur.role::text = p.role
    WHERE ur.user_id = p_user_id
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

CREATE OR REPLACE FUNCTION public.notify_clinic_users_on_smart_hub_booking(
  p_clinic_id uuid,
  p_title text,
  p_message text,
  p_reference_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_clinic_id IS NULL OR p_reference_id IS NULL THEN
    RETURN 0;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_notifications un
    WHERE un.reference_id = p_reference_id
      AND un.clinic_id = p_clinic_id
      AND un.type = 'appointment_created'
      AND COALESCE(un.metadata->>'source', '') = 'smart_hub'
    LIMIT 1
  ) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.user_notifications (
    user_id, clinic_id, type, title, message, reference_id, metadata
  )
  SELECT
    cu.user_id,
    p_clinic_id,
    'appointment_created',
    p_title,
    p_message,
    p_reference_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'smart_hub')
  FROM public.clinic_users cu
  WHERE cu.clinic_id = p_clinic_id
    AND public.user_has_feature(cu.user_id, 'agenda')
    AND public.user_can_clinic_action_as(cu.user_id, p_clinic_id, 'agenda', 'can_view');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN COALESCE(v_count, 0);
EXCEPTION
  WHEN unique_violation THEN
    RETURN 0;
  WHEN OTHERS THEN
    RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.user_can_clinic_action_as(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_clinic_users_on_smart_hub_booking(uuid, text, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.user_can_clinic_action_as(uuid, uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_clinic_users_on_smart_hub_booking(uuid, text, text, uuid, jsonb)
  TO service_role;

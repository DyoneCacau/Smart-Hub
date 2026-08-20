-- ============================================================
-- SECURITY HARDENING — Fix all identified vulnerabilities
-- ============================================================

-- ============================================================
-- FIX 1: PRIVILEGE ESCALATION — user_roles INSERT
-- Any clinic 'admin' could assign 'superadmin' to themselves.
-- Fix: restrict INSERT to only allowed roles, never 'superadmin'.
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;

CREATE POLICY "Admins can insert non-superadmin roles"
ON public.user_roles FOR INSERT
WITH CHECK (
  public.is_admin(auth.uid())
  AND role::text != 'superadmin'
  -- Admin can only add roles for users in their own clinic
  AND user_id IN (
    SELECT cu2.user_id FROM public.clinic_users cu2
    WHERE cu2.clinic_id = public.get_user_clinic_id(auth.uid())
  )
);

-- Only superadmins can ever assign the superadmin role
CREATE POLICY "Only superadmins can insert superadmin role"
ON public.user_roles FOR INSERT
WITH CHECK (
  public.is_superadmin(auth.uid())
);

-- ============================================================
-- FIX 2: ROLE SCOPE — user_roles DELETE
-- Admins could delete roles for users outside their clinic.
-- Fix: scope DELETE to own clinic members only.
-- ============================================================
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Admins can delete roles in own clinic"
ON public.user_roles FOR DELETE
USING (
  (
    -- Clinic admin can only delete non-superadmin roles in own clinic
    public.is_admin(auth.uid())
    AND role::text != 'superadmin'
    AND user_id IN (
      SELECT cu2.user_id FROM public.clinic_users cu2
      WHERE cu2.clinic_id = public.get_user_clinic_id(auth.uid())
    )
  )
  OR public.is_superadmin(auth.uid())
);

-- ============================================================
-- FIX 3: MISSING RLS — financial_audit table
-- No RLS = any authenticated user reads ALL clinics' audit logs.
-- Fix: enable RLS, scope to own clinic + superadmin.
-- ============================================================
ALTER TABLE public.financial_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinic users can view own financial audit"
ON public.financial_audit FOR SELECT
USING (
  clinic_id IN (
    SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Clinic users can insert own financial audit"
ON public.financial_audit FOR INSERT
WITH CHECK (
  clinic_id IN (
    SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()
  )
  AND user_id = auth.uid()
);

CREATE POLICY "Superadmins can manage all financial audit"
ON public.financial_audit FOR ALL
USING (public.is_superadmin(auth.uid()));

-- ============================================================
-- FIX 4: MISSING RLS — audit_events table
-- Same issue as financial_audit.
-- ============================================================
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinic users can view own audit events"
ON public.audit_events FOR SELECT
USING (
  clinic_id IN (
    SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Clinic users can insert own audit events"
ON public.audit_events FOR INSERT
WITH CHECK (
  clinic_id IN (
    SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()
  )
  AND user_id = auth.uid()
);

CREATE POLICY "Superadmins can manage all audit events"
ON public.audit_events FOR ALL
USING (public.is_superadmin(auth.uid()));

-- ============================================================
-- FIX 5: PROFESSIONALS — cross-clinic data leak
-- "Everyone can view active professionals" leaks data across clinics.
-- Fix: scope SELECT to own clinic only.
-- ============================================================
DROP POLICY IF EXISTS "Everyone can view active professionals" ON public.professionals;

CREATE POLICY "Clinic members can view own professionals"
ON public.professionals FOR SELECT
USING (
  -- Must belong to the same clinic
  EXISTS (
    SELECT 1 FROM public.clinic_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.clinic_id = public.get_user_clinic_id(auth.uid())
  )
  -- And professional must be in same clinic
  AND (
    clinic_id = public.get_user_clinic_id(auth.uid())
    OR public.is_superadmin(auth.uid())
  )
);

CREATE POLICY "Superadmins can view all professionals"
ON public.professionals FOR SELECT
USING (public.is_superadmin(auth.uid()));

-- ============================================================
-- FIX 6: PAYMENT HISTORY — clinic users need to see their own
-- No SELECT policy for clinic users existed; only superadmin could read.
-- ============================================================
CREATE POLICY "Clinic users can view their payment history"
ON public.payment_history FOR SELECT
USING (
  subscription_id IN (
    SELECT s.id FROM public.subscriptions s
    WHERE s.clinic_id IN (
      SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid()
    )
  )
);

-- ============================================================
-- FIX 7: Professionals — add clinic_id column guard
-- Ensure clinic admins can only insert/update/delete in own clinic
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert professionals with feature check" ON public.professionals;
CREATE POLICY "Admins can insert professionals in own clinic"
ON public.professionals FOR INSERT
WITH CHECK (
  public.is_admin(auth.uid())
  AND public.user_has_feature(auth.uid(), 'profissionais')
  AND clinic_id = public.get_user_clinic_id(auth.uid())
);

DROP POLICY IF EXISTS "Admins can update professionals with feature check" ON public.professionals;
CREATE POLICY "Admins can update professionals in own clinic"
ON public.professionals FOR UPDATE
USING (
  public.is_admin(auth.uid())
  AND public.user_has_feature(auth.uid(), 'profissionais')
  AND clinic_id = public.get_user_clinic_id(auth.uid())
);

DROP POLICY IF EXISTS "Admins can delete professionals with feature check" ON public.professionals;
CREATE POLICY "Admins can delete professionals in own clinic"
ON public.professionals FOR DELETE
USING (
  public.is_admin(auth.uid())
  AND public.user_has_feature(auth.uid(), 'profissionais')
  AND clinic_id = public.get_user_clinic_id(auth.uid())
);

-- ============================================================
-- FIX 8: Subscriptions — block clinic users from modifying their own subscription
-- Clinic users should only READ; only superadmin modifies subscriptions
-- ============================================================
DROP POLICY IF EXISTS "Superadmins can manage subscriptions" ON public.subscriptions;

CREATE POLICY "Superadmins can manage subscriptions"
ON public.subscriptions FOR ALL
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));

-- ============================================================
-- FIX 9: plans — block unauthenticated reads (anon key should not expose all plans)
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view active plans" ON public.plans;

CREATE POLICY "Authenticated users can view active plans"
ON public.plans FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (is_active = true OR public.is_superadmin(auth.uid()))
);

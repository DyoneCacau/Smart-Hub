-- Plans: add promo/discount fields (Pix discount only)
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS discount_pix_percent NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_price_monthly NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS promo_active BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS promo_label TEXT;

-- Subscriptions: store external provider references
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS external_reference TEXT,
  ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_payment_id TEXT;

-- Upgrade requests: store payment references
ALTER TABLE public.upgrade_requests
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS mp_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT;

-- Update default plan prices (BR)
UPDATE public.plans SET price_monthly = 119.99 WHERE slug = 'basico';
UPDATE public.plans SET price_monthly = 239.90 WHERE slug = 'profissional';
UPDATE public.plans SET price_monthly = 439.90 WHERE slug = 'premium';

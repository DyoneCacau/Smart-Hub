-- ============================================================================
-- HEALTHCARE — Smart Hub: permitir click_action = 'booking'
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Execute no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
-- 2. Antescria APENAS a check constraint smart_hub_buttons_click_action_check
-- 3. Preserva todos os valores legados e adiciona 'booking'
-- 4. NÃO altera registros, RLS, colunas, Edge Functions nem dados existentes
-- 5. url permanece nullable (booking pode gravar url = null)
-- 6. Equivalente à migration: 20260805190000_smart_hub_click_action_booking.sql
--
-- ANTES (inspecionar definição atual):
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.smart_hub_buttons'::regclass
--   AND conname = 'smart_hub_buttons_click_action_check';
--
-- DEPOIS (validar):
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.smart_hub_buttons'::regclass
--   AND conname = 'smart_hub_buttons_click_action_check';
-- Esperado: IN (..., 'booking')
-- ============================================================================

ALTER TABLE public.smart_hub_buttons
  DROP CONSTRAINT IF EXISTS smart_hub_buttons_click_action_check;

ALTER TABLE public.smart_hub_buttons
  ADD CONSTRAINT smart_hub_buttons_click_action_check
  CHECK (click_action IN (
    'auto',
    'form',
    'whatsapp',
    'link',
    'phone',
    'email',
    'map',
    'info',
    'booking'
  ));

COMMENT ON COLUMN public.smart_hub_buttons.click_action IS
  'Ação ao clicar: auto (deriva do type) | form | whatsapp | link | phone | email | map | info | booking';

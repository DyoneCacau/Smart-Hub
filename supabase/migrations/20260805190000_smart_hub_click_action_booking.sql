-- Smart Hub: permitir click_action = 'booking' na check constraint.
-- Idempotente (DROP IF EXISTS + ADD). Não altera dados, RLS nem colunas.
-- Ver PRODUCAO_38_SMART_HUB_CLICK_ACTION_BOOKING.sql (execução manual).

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

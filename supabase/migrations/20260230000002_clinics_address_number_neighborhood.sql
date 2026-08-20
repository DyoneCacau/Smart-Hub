-- ============================================================================
-- Adiciona address_number (número) e neighborhood (bairro) à tabela clinics
-- Para formulário de endereço com campos separados
-- ============================================================================

ALTER TABLE public.clinics
ADD COLUMN IF NOT EXISTS address_number TEXT;

ALTER TABLE public.clinics
ADD COLUMN IF NOT EXISTS neighborhood TEXT;

COMMENT ON COLUMN public.clinics.address_number IS 'Número do endereço (separado da rua)';
COMMENT ON COLUMN public.clinics.neighborhood IS 'Bairro do endereço';

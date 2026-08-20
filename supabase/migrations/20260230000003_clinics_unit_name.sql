-- ============================================================================
-- Campo opcional para identificar a unidade (ex: "13 de maio", "Conj. Ceara")
-- Exibido em estilo discreto: Nome da clínica (Unidade X)
-- ============================================================================

ALTER TABLE public.clinics
ADD COLUMN IF NOT EXISTS unit_name TEXT;

COMMENT ON COLUMN public.clinics.unit_name IS 'Identificador da unidade para redes com várias clínicas - ex: 13 de maio, Conj. Ceara';

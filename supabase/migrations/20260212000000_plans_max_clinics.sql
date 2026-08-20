-- Adiciona coluna max_clinics na tabela plans para suportar redes de clínicas
-- 999 = ilimitado (exibido como infinito na UI)
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_clinics INTEGER DEFAULT 999;

COMMENT ON COLUMN public.plans.max_clinics IS 'Maximo de clinicas por cliente. 999 = ilimitado.';

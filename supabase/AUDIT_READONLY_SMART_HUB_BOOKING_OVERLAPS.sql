-- ============================================================
-- AUDIT READONLY — CONFLITOS DE HORÁRIO EM appointments
-- ============================================================
-- INSTRUÇÕES:
-- 1. Execute ANTES de aplicar PRODUCAO_36_SMART_HUB_PUBLIC_BOOKING.sql
--    (ou a migration 20260731140000_smart_hub_public_booking.sql).
-- 2. No Supabase: SQL Editor > New query > cole e Run.
-- 3. SOMENTE LEITURA — não altera dados.
-- 4. Se retornar linhas, há sobreposições históricas entre agendamentos
--    ativos (status diferente de cancelled / no_show) no mesmo profissional
--    e data. Resolva manualmente antes de confiar só no trigger anti-overlap.
-- 5. O trigger da Fase B bloqueia NOVOS overlaps; não reescreve o histórico.
-- ============================================================

SELECT
  a.id AS a_id,
  b.id AS b_id,
  a.clinic_id,
  a.professional_id,
  a.date,
  a.start_time AS a_start,
  a.end_time AS a_end,
  a.status AS a_status,
  b.start_time AS b_start,
  b.end_time AS b_end,
  b.status AS b_status
FROM public.appointments a
JOIN public.appointments b
  ON a.clinic_id = b.clinic_id
 AND a.professional_id = b.professional_id
 AND a.date = b.date
 AND a.id < b.id
 AND a.status NOT IN ('cancelled', 'no_show')
 AND b.status NOT IN ('cancelled', 'no_show')
 AND a.start_time < b.end_time
 AND b.start_time < a.end_time
ORDER BY a.clinic_id, a.professional_id, a.date, a.start_time;

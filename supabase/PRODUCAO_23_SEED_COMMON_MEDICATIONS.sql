-- ============================================================
-- PRODUÇÃO 23 — LISTA INICIAL DE MEDICAMENTOS COMUNS NA ODONTOLOGIA
-- ============================================================
-- INSTRUÇÕES:
-- 1. Execute DEPOIS do PRODUCAO_21_CLINIC_MEDICATIONS.sql (cria a tabela
--    clinic_medications).
-- 2. No Supabase, abra SQL Editor > New query, cole e execute.
-- 3. Script idempotente (ON CONFLICT DO NOTHING) — pode rodar de novo sem
--    duplicar nem sobrescrever o que a clínica já personalizou.
--
-- IMPORTANTE — LEIA ANTES DE EXECUTAR:
-- Esta é uma lista INICIAL com os medicamentos MAIS COMUNS usados em
-- receituário odontológico no Brasil (antibióticos, analgésicos,
-- anti-inflamatórios, corticoides e um ansiolítico de uso pontual em
-- sedação). NÃO é — e não pretende ser — uma base de dados farmacêutica
-- completa (isso exigiria uma base licenciada da ANVISA/CMED, com milhares
-- de apresentações comerciais). Doses e posologia continuam a critério do
-- profissional a cada prescrição; este script só cadastra os NOMES no
-- catálogo pra facilitar a busca. A clínica pode editar/completar essa
-- lista livremente pela tela (ela já aprende com o uso, salvando qualquer
-- medicamento novo digitado no Receituário).
-- ============================================================

BEGIN;

INSERT INTO public.clinic_medications (clinic_id, name, is_controlled, is_active)
SELECT c.id, seed.name, seed.is_controlled, true
FROM public.clinics c
CROSS JOIN (
  VALUES
    -- Antibióticos
    ('Amoxicilina 500mg', false),
    ('Amoxicilina + Clavulanato de Potássio 875mg+125mg', false),
    ('Azitromicina 500mg', false),
    ('Clindamicina 300mg', false),
    ('Metronidazol 400mg', false),
    ('Cefalexina 500mg', false),
    -- Analgésicos e anti-inflamatórios
    ('Dipirona Sódica 500mg', false),
    ('Paracetamol 750mg', false),
    ('Ibuprofeno 600mg', false),
    ('Nimesulida 100mg', false),
    ('Diclofenaco de Potássio 50mg', false),
    ('Cetoprofeno 100mg', false),
    ('Ácido Mefenâmico 500mg', false),
    -- Corticoides
    ('Dexametasona 4mg', false),
    ('Prednisolona 20mg', false),
    -- Uso tópico / bucal
    ('Clorexidina 0,12% (colutório)', false),
    ('Nistatina (suspensão oral)', false),
    -- Ansiolítico de uso pontual (sedação) — controle especial (Lista B1 ANVISA)
    ('Diazepam 5mg', true)
) AS seed(name, is_controlled)
ON CONFLICT (clinic_id, lower(trim(name))) DO NOTHING;

COMMIT;

-- VERIFICAÇÃO (somente leitura):
SELECT c.name AS clinica, count(cm.id) AS medicamentos
FROM public.clinics c
LEFT JOIN public.clinic_medications cm ON cm.clinic_id = c.id
GROUP BY c.id, c.name
ORDER BY c.name;

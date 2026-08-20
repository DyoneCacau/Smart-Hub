/**
 * Ingestão universal de leads.
 *
 * Ponto único onde qualquer integração cria um lead no CRM. A API REST
 * (`POST /integrations-api/leads`) e o webhook genérico
 * (`integrations-webhook/<slug>`) chamam a mesma função — o comportamento é
 * idêntico independente de quem chamou.
 *
 * Tenant: `clinicId` vem sempre resolvido (token ou slug), nunca do payload.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { HttpError } from './httpError.ts'
import {
  normalizeLeadPayload,
  type LeadDedupeMode,
  type LeadSourceValue,
  type NormalizedLead,
} from './leadPayload.ts'

export type { LeadDedupeMode } from './leadPayload.ts'
export { isLeadDedupeMode, LEAD_DEDUPE_MODES } from './leadPayload.ts'

/** Janela em que um mesmo contato é tratado como o mesmo lead. */
const CONTACT_DEDUPE_WINDOW_DAYS = 30

export interface IngestLeadInput {
  clinicId: string
  integrationId: string | null
  provider: string | null
  payload: unknown
  /** Origem padrão quando o payload não informa */
  defaultLeadSource?: LeadSourceValue | null
  /** auto (padrão): id externo e depois contato recente */
  dedupe?: LeadDedupeMode
  /** Responsável inicial (ex.: Smart Hub capture) */
  ownerUserId?: string | null
  /**
   * Teste administrativo: não mascara falhas de schema e não usa fallback
   * silencioso que omite colunas de origem.
   */
  diagnosticMode?: boolean
}

export interface IngestLeadResult {
  leadId: string
  created: boolean
  duplicate: boolean
  /** Como o lead existente foi encontrado, quando duplicado */
  matchedBy: 'external_id' | 'phone' | 'email' | null
  lead: NormalizedLead
}

interface ExistingLead {
  id: string
  name: string
  phone: string | null
  email: string | null
  cpf: string | null
  interest: string | null
  notes: string | null
  estimated_value: number | null
  lead_source: string | null
  referral_name: string | null
}

const EXISTING_COLUMNS =
  'id, name, phone, email, cpf, interest, notes, estimated_value, lead_source, referral_name'

/** Mensagem segura ao visitante — nunca inclui nomes de coluna/tabela. */
const SAFE_CREATE_ERROR = 'Falha ao criar lead no CRM'
const SCHEMA_OUTDATED_CODE = 'crm_schema_outdated'
const SCHEMA_OUTDATED_ADMIN_MSG =
  'Schema do CRM desatualizado (colunas de origem ausentes). Execute PRODUCAO_34_CRM_LEADS_SCHEMA_SYNC.sql no SQL Editor e confirme NOTIFY pgrst.'

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  // 42703 = undefined_column (Postgres)
  // PGRST204 = coluna ausente no schema cache do PostgREST (caso típico em produção)
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  const msg = (error.message || '').toLowerCase()
  return (
    msg.includes('schema cache') ||
    (msg.includes('could not find') && msg.includes('column'))
  )
}

function logLeadDbError(
  context: string,
  error: { code?: string; message?: string; details?: string; hint?: string } | null,
): void {
  console.error(`[leads] ${context}`, {
    code: error?.code ?? null,
    message: error?.message ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  })
}

function throwCreateFailure(
  error: { code?: string; message?: string } | null,
  diagnosticMode: boolean,
): never {
  if (diagnosticMode && isMissingColumnError(error)) {
    throw new HttpError(500, SCHEMA_OUTDATED_ADMIN_MSG, SCHEMA_OUTDATED_CODE)
  }
  throw new HttpError(500, SAFE_CREATE_ERROR, 'lead_create_failed')
}

async function findByExternalId(
  supabase: SupabaseClient,
  clinicId: string,
  integrationId: string | null,
  externalLeadId: string,
): Promise<ExistingLead | null> {
  let query = supabase
    .from('crm_leads')
    .select(EXISTING_COLUMNS)
    .eq('clinic_id', clinicId)
    .eq('external_lead_id', externalLeadId)
    .limit(1)

  query = integrationId
    ? query.eq('integration_id', integrationId)
    : query.is('integration_id', null)

  const { data, error } = await query.maybeSingle()
  if (error && !isMissingColumnError(error)) {
    logLeadDbError('falha ao verificar lead existente', error)
    throw new HttpError(500, 'Falha ao verificar lead existente', 'lead_lookup_failed')
  }
  return (data as ExistingLead | null) ?? null
}

async function findByContact(
  supabase: SupabaseClient,
  clinicId: string,
  lead: NormalizedLead,
): Promise<{ existing: ExistingLead; matchedBy: 'phone' | 'email' } | null> {
  const since = new Date(
    Date.now() - CONTACT_DEDUPE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  // As colunas *_dedupe_key são geradas pelo banco (PRODUCAO_26): comparam o
  // contato mesmo quando o lead foi digitado à mão com máscara.
  const lookup = async (column: string, value: string) => {
    const { data, error } = await supabase
      .from('crm_leads')
      .select(EXISTING_COLUMNS)
      .eq('clinic_id', clinicId)
      .eq(column, value)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Sem PRODUCAO_26/34 a deduplicação por contato fica desligada, mas o lead entra
    if (error && !isMissingColumnError(error)) {
      logLeadDbError(`falha ao verificar lead por ${column}`, error)
      throw new HttpError(500, 'Falha ao verificar lead existente', 'lead_lookup_failed')
    }
    return (data as ExistingLead | null) ?? null
  }

  if (lead.phoneDedupeKey) {
    const existing = await lookup('phone_dedupe_key', lead.phoneDedupeKey)
    if (existing) return { existing, matchedBy: 'phone' }
  }

  if (lead.emailDedupeKey) {
    const existing = await lookup('email_dedupe_key', lead.emailDedupeKey)
    if (existing) return { existing, matchedBy: 'email' }
  }

  return null
}

/**
 * Enriquecimento do lead já existente: preenche só o que está vazio.
 * Nunca sobrescreve informação que a clínica já tem, nem move de etapa.
 */
async function enrichExisting(
  supabase: SupabaseClient,
  existing: ExistingLead,
  lead: NormalizedLead,
): Promise<void> {
  const patch: Record<string, unknown> = {}

  if (!existing.phone && lead.phone) patch.phone = lead.phone
  if (!existing.email && lead.email) patch.email = lead.email
  if (!existing.cpf && lead.cpf) patch.cpf = lead.cpf
  if (!existing.interest && lead.interest) patch.interest = lead.interest
  if (!existing.lead_source && lead.leadSource) patch.lead_source = lead.leadSource
  if (!existing.referral_name && lead.referralName) patch.referral_name = lead.referralName
  if (existing.estimated_value == null && lead.estimatedValue != null) {
    patch.estimated_value = lead.estimatedValue
  }

  if (Object.keys(patch).length === 0) return

  const { error } = await supabase.from('crm_leads').update(patch).eq('id', existing.id)
  if (error) console.error('[leads] falha ao enriquecer lead existente:', error)
}

/**
 * Cria (ou reaproveita) o lead no CRM da clínica.
 *
 * Idempotência em duas camadas:
 * 1. `external_lead_id` do provedor, garantido por índice único;
 * 2. telefone ou e-mail vistos nos últimos 30 dias, para o Kanban não
 *    encher de cards repetidos do mesmo paciente.
 */
export async function ingestLead(
  supabase: SupabaseClient,
  input: IngestLeadInput,
): Promise<IngestLeadResult> {
  const lead = normalizeLeadPayload(input.payload, {
    provider: input.provider,
    defaultLeadSource: input.defaultLeadSource ?? null,
  })

  const dedupe = input.dedupe ?? 'auto'

  if (dedupe !== 'none' && lead.externalLeadId) {
    const existing = await findByExternalId(
      supabase,
      input.clinicId,
      input.integrationId,
      lead.externalLeadId,
    )
    if (existing) {
      await enrichExisting(supabase, existing, lead)
      return {
        leadId: existing.id,
        created: false,
        duplicate: true,
        matchedBy: 'external_id',
        lead,
      }
    }
  }

  if (dedupe === 'auto') {
    const match = await findByContact(supabase, input.clinicId, lead)
    if (match) {
      await enrichExisting(supabase, match.existing, lead)
      return {
        leadId: match.existing.id,
        created: false,
        duplicate: true,
        matchedBy: match.matchedBy,
        lead,
      }
    }
  }

  const row: Record<string, unknown> = {
    clinic_id: input.clinicId,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    cpf: lead.cpf,
    stage: lead.stage,
    lead_source: lead.leadSource,
    referral_name: lead.referralName,
    interest: lead.interest,
    estimated_value: lead.estimatedValue,
    notes: lead.notes,
    integration_id: input.integrationId,
    external_lead_id: lead.externalLeadId,
    source_payload: input.payload ?? null,
  }

  if (input.ownerUserId) {
    row.owner_user_id = input.ownerUserId
  }

  const diagnosticMode = Boolean(input.diagnosticMode)

  const { data, error } = await supabase
    .from('crm_leads')
    .insert(row)
    .select('id')
    .maybeSingle()

  if (error) {
    logLeadDbError('falha ao criar lead', error)

    // Corrida entre dois eventos do mesmo lead: o índice único resolve
    if (error.code === '23505' && lead.externalLeadId) {
      const existing = await findByExternalId(
        supabase,
        input.clinicId,
        input.integrationId,
        lead.externalLeadId,
      )
      if (existing) {
        return {
          leadId: existing.id,
          created: false,
          duplicate: true,
          matchedBy: 'external_id',
          lead,
        }
      }
    }

    // Schema desatualizado (PRODUCAO_26/34): em teste admin não esconde a causa
    if (isMissingColumnError(error)) {
      if (diagnosticMode) {
        throwCreateFailure(error, true)
      }

      // Visitante: tenta gravar sem campos de origem (resiliência transitória)
      const fallback = { ...row }
      delete fallback.integration_id
      delete fallback.external_lead_id
      delete fallback.source_payload

      const retry = await supabase.from('crm_leads').insert(fallback).select('id').maybeSingle()
      if (retry.error) {
        logLeadDbError('falha ao criar lead (fallback)', retry.error)
        throwCreateFailure(retry.error, false)
      }
      return {
        leadId: String(retry.data?.id),
        created: true,
        duplicate: false,
        matchedBy: null,
        lead,
      }
    }

    throwCreateFailure(error, diagnosticMode)
  }

  return {
    leadId: String(data?.id),
    created: true,
    duplicate: false,
    matchedBy: null,
    lead,
  }
}

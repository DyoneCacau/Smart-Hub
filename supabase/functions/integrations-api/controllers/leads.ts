/**
 * Controller REST universal de leads.
 *
 * `POST /leads` aceita qualquer formato de payload: JSON plano em português
 * ou inglês, `field_data` do Meta, listas de campos de formulário e lotes.
 * Qualquer integração (n8n, Make, Zapier, landing page, ERP) cria lead aqui
 * usando apenas um token da clínica com escopo `leads:write`.
 */
import { HttpError, serviceClient } from '../../_shared/integrations.ts'
import { ingestLead } from '../../_shared/leads.ts'
import {
  isLeadDedupeMode,
  isLeadSourceValue,
  LEAD_DEDUPE_MODES,
  LEAD_SOURCE_VALUES,
  type LeadDedupeMode,
  type LeadSourceValue,
} from '../../_shared/leadPayload.ts'
import type { RouteHandlerResult } from '../router.ts'

const PUBLIC_COLUMNS =
  'id, name, phone, email, cpf, stage, lead_source, referral_name, interest, estimated_value, next_follow_up, notes, patient_id, appointment_id, lost_reason, created_at, updated_at'

const ORIGIN_COLUMNS = `${PUBLIC_COLUMNS}, integration_id, external_lead_id`

const MAX_BATCH = 100
const MAX_LIMIT = 200

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingColumnError(error: { code?: string } | null): boolean {
  // 42703 = undefined_column → PRODUCAO_26 ainda não executado
  return error?.code === '42703'
}

function parseLimit(searchParams: URLSearchParams): number {
  const raw = Number(searchParams.get('limit') || 50)
  if (!Number.isFinite(raw) || raw <= 0) return 50
  return Math.min(Math.trunc(raw), MAX_LIMIT)
}

export async function listLeads(
  clinicId: string,
  searchParams: URLSearchParams,
): Promise<RouteHandlerResult> {
  const supabase = serviceClient()

  const build = (columns: string) => {
    let request = supabase
      .from('crm_leads')
      .select(columns)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(parseLimit(searchParams))

    const stage = searchParams.get('stage')
    const source = searchParams.get('lead_source')
    const since = searchParams.get('since')
    const phone = searchParams.get('phone')
    if (stage) request = request.eq('stage', stage)
    if (source) request = request.eq('lead_source', source)
    if (since) request = request.gte('created_at', since)
    if (phone) request = request.eq('phone', phone.replace(/\D/g, ''))
    return request
  }

  let { data, error } = await build(ORIGIN_COLUMNS)
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await build(PUBLIC_COLUMNS))
  }
  if (error) throw new HttpError(500, 'Falha ao listar leads')

  return { body: { data: data ?? [] } }
}

export async function getLead(clinicId: string, leadId: string): Promise<RouteHandlerResult> {
  const supabase = serviceClient()

  const load = (columns: string) =>
    supabase
      .from('crm_leads')
      .select(columns)
      .eq('clinic_id', clinicId)
      .eq('id', leadId)
      .maybeSingle()

  let { data, error } = await load(ORIGIN_COLUMNS)
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await load(PUBLIC_COLUMNS))
  }
  if (error) throw new HttpError(500, 'Falha ao carregar lead')
  if (!data) throw new HttpError(404, 'Lead não encontrado')

  return { body: { data } }
}

/**
 * Cria um lead ou um lote.
 *
 * Aceita `{ ...campos }`, `{ lead: {...} }` ou `{ leads: [...] }`. Campos de
 * controle opcionais no corpo: `integration_id`, `default_lead_source` e
 * `dedupe`. A clínica vem sempre do token.
 */
export async function createLeads(
  clinicId: string,
  payload: unknown,
): Promise<RouteHandlerResult> {
  if (!isRecord(payload) && !Array.isArray(payload)) {
    throw new HttpError(400, 'Corpo inválido: envie um objeto ou uma lista de leads')
  }

  const envelope = isRecord(payload) ? payload : { leads: payload }
  const batch = Array.isArray(envelope.leads)
    ? envelope.leads
    : Array.isArray(payload)
      ? payload
      : [payload]

  if (batch.length === 0) throw new HttpError(400, 'Nenhum lead no corpo da requisição')
  if (batch.length > MAX_BATCH) {
    throw new HttpError(413, `Máximo de ${MAX_BATCH} leads por requisição`)
  }

  const supabase = serviceClient()

  const integrationId = typeof envelope.integration_id === 'string'
    ? await assertIntegrationBelongsToClinic(clinicId, envelope.integration_id)
    : null

  let defaultLeadSource: LeadSourceValue | null = null
  if (envelope.default_lead_source != null && envelope.default_lead_source !== '') {
    if (
      typeof envelope.default_lead_source !== 'string'
      || !isLeadSourceValue(envelope.default_lead_source)
    ) {
      throw new HttpError(
        400,
        `default_lead_source inválido. Use: ${LEAD_SOURCE_VALUES.join(', ')}`,
      )
    }
    defaultLeadSource = envelope.default_lead_source
  }

  let dedupe: LeadDedupeMode = 'auto'
  if (envelope.dedupe != null && envelope.dedupe !== '') {
    if (typeof envelope.dedupe !== 'string' || !isLeadDedupeMode(envelope.dedupe)) {
      throw new HttpError(
        400,
        `dedupe inválido. Use: ${LEAD_DEDUPE_MODES.join(', ')}`,
      )
    }
    dedupe = envelope.dedupe
  }

  const results = []
  for (const item of batch) {
    const result = await ingestLead(supabase, {
      clinicId,
      integrationId,
      provider: null,
      payload: item,
      defaultLeadSource,
      dedupe,
    })
    results.push({
      leadId: result.leadId,
      created: result.created,
      duplicate: result.duplicate,
      matchedBy: result.matchedBy,
      name: result.lead.name,
      warnings: result.lead.warnings,
    })
  }

  const created = results.filter((r) => r.created).length

  return {
    status: created > 0 ? 201 : 200,
    body: {
      data: results,
      summary: { received: results.length, created, duplicates: results.length - created },
    },
  }
}

/** Garante que a integração informada é da própria clínica do token. */
async function assertIntegrationBelongsToClinic(
  clinicId: string,
  integrationId: string,
): Promise<string> {
  const supabase = serviceClient()
  const { data, error } = await supabase
    .from('integrations')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('id', integrationId)
    .maybeSingle()

  if (error) throw new HttpError(500, 'Falha ao validar integração')
  if (!data) throw new HttpError(404, 'Integração não encontrada nesta clínica')
  return integrationId
}

const UPDATABLE_STAGES = ['new', 'contact', 'scheduled', 'won', 'lost']

/** Atualização enxuta para automações: etapa, follow-up e observação. */
export async function updateLead(
  clinicId: string,
  leadId: string,
  payload: unknown,
): Promise<RouteHandlerResult> {
  if (!isRecord(payload)) throw new HttpError(400, 'Corpo inválido')

  const patch: Record<string, unknown> = {}

  if (typeof payload.stage === 'string') {
    if (!UPDATABLE_STAGES.includes(payload.stage)) {
      throw new HttpError(400, `stage inválido. Use: ${UPDATABLE_STAGES.join(', ')}`)
    }
    patch.stage = payload.stage
    if (payload.stage !== 'lost') patch.lost_reason = null
  }
  if (typeof payload.lost_reason === 'string') patch.lost_reason = payload.lost_reason.trim() || null
  if (typeof payload.notes === 'string') patch.notes = payload.notes.trim() || null
  if (typeof payload.interest === 'string') patch.interest = payload.interest.trim() || null
  if (typeof payload.next_follow_up === 'string') {
    patch.next_follow_up = payload.next_follow_up || null
  }
  if (typeof payload.estimated_value === 'number') patch.estimated_value = payload.estimated_value

  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, 'Nenhum campo atualizável no corpo')
  }

  const supabase = serviceClient()
  const { data, error } = await supabase
    .from('crm_leads')
    .update(patch)
    .eq('clinic_id', clinicId)
    .eq('id', leadId)
    .select(PUBLIC_COLUMNS)
    .maybeSingle()

  if (error) throw new HttpError(500, 'Falha ao atualizar lead')
  if (!data) throw new HttpError(404, 'Lead não encontrado')

  return { body: { data } }
}

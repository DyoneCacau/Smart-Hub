/**
 * Captura Facebook/Instagram Lead Ads → CRM (via ingestLead).
 *
 * - Tenant só pelo page_id cadastrado na integração Meta da clínica.
 * - Nunca confia em clinic_id do payload externo.
 * - Idempotência: provider + leadgen_id → external_lead_id no ingestLead.
 * - Sem tokens em logs / respostas públicas.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { HttpError } from './httpError.ts'
import { ingestLead } from './leads.ts'
import { normalizeLeadPayload } from './leadPayload.ts'
import {
  fetchMetaLeadById,
  subscribePageToLeadgen,
  unsubscribePageFromLeadgen,
  resolvePageAccessToken,
} from './metaGraph.ts'
import {
  logConnectionEvent,
  META_PROVIDER,
  mergeIntegrationConfig,
  readMetaAccessToken,
  readMetaPublicConfig,
  type MetaPublicConfig,
} from './metaConnection.ts'
import {
  extractLeadgenChanges,
  resolveMetaLeadCrmSource,
  type MetaLeadgenChange,
} from './metaLeadAdsParse.ts'

export type { MetaLeadgenChange }
export { extractLeadgenChanges, resolveMetaLeadCrmSource }

export interface MetaLeadgenProcessResult {
  handled: boolean
  created: boolean
  duplicate: boolean
  skipped: boolean
  reason: string | null
  leadId: string | null
  leadgenId: string | null
  clinicId: string | null
  integrationId: string | null
}

export async function findMetaIntegrationByPageId(
  supabase: SupabaseClient,
  pageId: string,
): Promise<{
  id: string
  clinic_id: string
  provider: string
  config: Record<string, unknown>
  is_active: boolean
  status: string
} | null> {
  const { data, error } = await supabase
    .from('integrations')
    .select('id, clinic_id, provider, config, is_active, status')
    .eq('provider', META_PROVIDER)
    .eq('is_active', true)
    .filter('config->meta->>page_id', 'eq', pageId)
    .limit(5)

  if (error) throw new HttpError(500, 'Falha ao resolver integração Meta pela Página')
  const rows = (data || []) as Array<{
    id: string
    clinic_id: string
    provider: string
    config: Record<string, unknown> | null
    is_active: boolean
    status: string
  }>

  const withCapture = rows.filter((row) => {
    const config = (row.config || {}) as Record<string, unknown>
    return config.lead_capture === true
  })

  if (withCapture.length === 0) return null
  if (withCapture.length > 1) {
    console.error('[meta-leadgen] page_id ambíguo', JSON.stringify({
      page_id: pageId,
      count: withCapture.length,
    }))
    throw new HttpError(409, 'Mais de uma clínica com captura ativa para esta Página')
  }

  const row = withCapture[0]
  return {
    id: row.id,
    clinic_id: row.clinic_id,
    provider: row.provider,
    config: (row.config || {}) as Record<string, unknown>,
    is_active: row.is_active,
    status: row.status,
  }
}

async function readPageAccessToken(
  supabase: SupabaseClient,
  clinicId: string,
  integrationId: string,
): Promise<{ pageAccessToken: string; userAccessToken: string; expiresAt: string | null } | null> {
  const { data, error } = await supabase
    .from('integration_credentials')
    .select('id, access_token, page_access_token, expires_at')
    .eq('clinic_id', clinicId)
    .eq('integration_id', integrationId)
    .maybeSingle()

  if (error) {
    // Coluna page_access_token pode não existir antes do PRODUCAO_30
    if (error.code === '42703') {
      const creds = await readMetaAccessToken(supabase, clinicId, integrationId)
      if (!creds) return null
      return {
        pageAccessToken: creds.accessToken,
        userAccessToken: creds.accessToken,
        expiresAt: creds.expiresAt,
      }
    }
    throw new HttpError(500, 'Falha ao ler credenciais Meta')
  }
  if (!data?.access_token) return null

  const pageToken = typeof data.page_access_token === 'string' && data.page_access_token.trim()
    ? data.page_access_token.trim()
    : data.access_token as string

  return {
    pageAccessToken: pageToken,
    userAccessToken: data.access_token as string,
    expiresAt: (data.expires_at as string | null) ?? null,
  }
}

export async function upsertPageAccessToken(
  supabase: SupabaseClient,
  clinicId: string,
  integrationId: string,
  pageAccessToken: string,
): Promise<void> {
  const { error } = await supabase
    .from('integration_credentials')
    .update({ page_access_token: pageAccessToken })
    .eq('clinic_id', clinicId)
    .eq('integration_id', integrationId)

  if (error) {
    if (error.code === '42703') {
      throw new HttpError(
        503,
        'Execute PRODUCAO_30_META_LEAD_ADS.sql (coluna page_access_token ausente)',
      )
    }
    throw new HttpError(500, 'Falha ao gravar page access token')
  }
}

/** Processa um único leadgen_id (fetch Graph + ingestLead). */
export async function processLeadgenChange(
  supabase: SupabaseClient,
  change: MetaLeadgenChange,
): Promise<MetaLeadgenProcessResult> {
  const base: MetaLeadgenProcessResult = {
    handled: false,
    created: false,
    duplicate: false,
    skipped: false,
    reason: null,
    leadId: null,
    leadgenId: change.leadgenId,
    clinicId: null,
    integrationId: null,
  }

  const integration = await findMetaIntegrationByPageId(supabase, change.pageId)
  if (!integration) {
    return { ...base, skipped: true, reason: 'page_id_desconhecido_ou_captura_inativa' }
  }

  base.clinicId = integration.clinic_id
  base.integrationId = integration.id

  const publicMeta = readMetaPublicConfig(integration.config)
  if (publicMeta.page_id && publicMeta.page_id !== change.pageId) {
    return { ...base, skipped: true, reason: 'page_id_nao_corresponde' }
  }

  const creds = await readPageAccessToken(supabase, integration.clinic_id, integration.id)
  if (!creds) {
    await logConnectionEvent(supabase, {
      clinicId: integration.clinic_id,
      integrationId: integration.id,
      eventType: 'leadgen_failed',
      status: 'error',
      message: 'Credenciais Meta ausentes ao processar leadgen',
      metadata: { leadgen_id: change.leadgenId, page_id: change.pageId },
    })
    return { ...base, reason: 'credenciais_ausentes' }
  }

  if (creds.expiresAt && new Date(creds.expiresAt).getTime() <= Date.now()) {
    await logConnectionEvent(supabase, {
      clinicId: integration.clinic_id,
      integrationId: integration.id,
      eventType: 'leadgen_failed',
      status: 'error',
      message: 'Token Meta expirado ao processar leadgen',
      metadata: { leadgen_id: change.leadgenId, page_id: change.pageId },
    })
    return { ...base, reason: 'token_expirado' }
  }

  let graphLead: Awaited<ReturnType<typeof fetchMetaLeadById>>
  try {
    graphLead = await fetchMetaLeadById(change.leadgenId, creds.pageAccessToken)
  } catch (error) {
    const message = error instanceof HttpError ? error.message : 'Falha Graph ao buscar lead'
    const status = error instanceof HttpError ? error.status : 502
    await logConnectionEvent(supabase, {
      clinicId: integration.clinic_id,
      integrationId: integration.id,
      eventType: 'leadgen_failed',
      status: 'error',
      message,
      metadata: {
        leadgen_id: change.leadgenId,
        page_id: change.pageId,
        http_status: status,
      },
    })
    if (status === 401) return { ...base, reason: 'token_expirado' }
    if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('(#200)')) {
      return { ...base, reason: 'permissao_ausente' }
    }
    if (status === 404 || message.toLowerCase().includes('does not exist')) {
      return { ...base, reason: 'lead_inexistente' }
    }
    // Temporário: propaga para o webhook responder 5xx e a Meta reenviar
    throw error instanceof HttpError ? error : new HttpError(502, message)
  }

  const { crmSource, originDetail } = resolveMetaLeadCrmSource(change.platform)

  const standardFieldKeys = new Set([
    'full_name', 'full name', 'name', 'nome', 'nome_completo', 'first_name', 'last_name',
    'email', 'e-mail', 'phone', 'phone_number', 'telefone', 'celular', 'whatsapp',
    'city', 'cidade', 'state', 'estado', 'cpf', 'company', 'empresa',
  ])
  const customFields = graphLead.fieldData
    .filter((field) => !standardFieldKeys.has(field.name.trim().toLowerCase()))
    .map((field) => `${field.name}: ${field.values.join(', ')}`)
    .filter((line) => line.length > 2)

  const ingestPayload = {
    leadgen_id: change.leadgenId,
    form_id: change.formId ?? graphLead.formId,
    ad_id: change.adId ?? graphLead.adId,
    page_id: change.pageId,
    created_time: change.createdTime ?? graphLead.createdTime,
    field_data: graphLead.fieldData,
    meta_origin: originDetail,
    platform: change.platform,
    notes: customFields.length > 0
      ? `Campos do formulário: ${customFields.join(' | ')}`
      : undefined,
  }

  // Não criar card vazio: exige telefone, e-mail ou nome real do formulário
  const preview = normalizeLeadPayload(ingestPayload, {
    provider: META_PROVIDER,
    defaultLeadSource: crmSource,
  })
  const noContact = !preview.phone && !preview.email
  const noRealName = preview.warnings.some((w) => w.includes('sem nome, telefone ou e-mail'))
    || preview.name === 'Lead sem identificação'
  if (noContact && noRealName) {
    await logConnectionEvent(supabase, {
      clinicId: integration.clinic_id,
      integrationId: integration.id,
      eventType: 'leadgen_failed',
      status: 'warning',
      message: 'Lead Meta sem nome/contato utilizável — não criado',
      metadata: {
        leadgen_id: change.leadgenId,
        page_id: change.pageId,
        field_count: graphLead.fieldData.length,
      },
    })
    return { ...base, skipped: true, reason: 'lead_sem_dados_uteis' }
  }

  const result = await ingestLead(supabase, {
    clinicId: integration.clinic_id,
    integrationId: integration.id,
    provider: META_PROVIDER,
    payload: ingestPayload,
    defaultLeadSource: crmSource,
    dedupe: 'external_id',
  })

  await logConnectionEvent(supabase, {
    clinicId: integration.clinic_id,
    integrationId: integration.id,
    eventType: result.created ? 'leadgen_ingested' : 'leadgen_duplicate',
    status: 'success',
    message: result.created ? 'Lead Meta capturado no CRM' : 'Lead Meta já existia (idempotente)',
    metadata: {
      leadgen_id: change.leadgenId,
      page_id: change.pageId,
      form_id: change.formId,
      ad_id: change.adId,
      origin_detail: originDetail,
      lead_id: result.leadId,
      duplicate: result.duplicate,
    },
  })

  return {
    ...base,
    handled: true,
    created: result.created,
    duplicate: result.duplicate,
    leadId: result.leadId,
    reason: null,
  }
}

export async function processMetaLeadgenWebhook(
  supabase: SupabaseClient,
  payload: unknown,
): Promise<{
  results: MetaLeadgenProcessResult[]
  processed: number
  duplicates: number
  skipped: number
  failed: number
}> {
  const changes = extractLeadgenChanges(payload)
  if (changes.length === 0) {
    return { results: [], processed: 0, duplicates: 0, skipped: 1, failed: 0 }
  }

  const results: MetaLeadgenProcessResult[] = []
  let processed = 0
  let duplicates = 0
  let skipped = 0
  let failed = 0

  for (const change of changes) {
    try {
      const result = await processLeadgenChange(supabase, change)
      results.push(result)
      if (result.skipped) skipped += 1
      else if (result.duplicate) {
        duplicates += 1
        processed += 1
      } else if (result.handled && result.created) processed += 1
      else if (result.reason) failed += 1
    } catch (error) {
      // Repropaga falha temporária da Graph após o primeiro lead (Meta reenvia)
      throw error
    }
  }

  return { results, processed, duplicates, skipped, failed }
}

export async function enableLeadCaptureForIntegration(
  supabase: SupabaseClient,
  input: {
    clinicId: string
    integrationId: string
    userId: string
  },
): Promise<{ meta: MetaPublicConfig; leadCapture: boolean }> {
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('id, clinic_id, provider, config, status')
    .eq('id', input.integrationId)
    .eq('clinic_id', input.clinicId)
    .eq('provider', META_PROVIDER)
    .maybeSingle()

  if (error || !integration) throw new HttpError(404, 'Conexão Meta não encontrada')
  const currentConfig = (integration.config || {}) as Record<string, unknown>
  const publicMeta = readMetaPublicConfig(currentConfig)

  if (publicMeta.connection_phase !== 'ready' || !publicMeta.page_id) {
    throw new HttpError(409, 'Selecione e salve uma Página antes de ativar a captura')
  }

  const creds = await readMetaAccessToken(supabase, input.clinicId, input.integrationId)
  if (!creds) throw new HttpError(409, 'Conexão Meta sem credenciais — reconecte')

  let pageToken: string
  try {
    pageToken = await resolvePageAccessToken(creds.accessToken, publicMeta.page_id)
  } catch (error) {
    const message = error instanceof HttpError ? error.message : 'Falha ao obter token da Página'
    throw new HttpError(
      error instanceof HttpError ? error.status : 502,
      message.includes('permission') || message.includes('(#200)')
        ? 'Permissão ausente. Reconecte o OAuth com pages_manage_metadata e leads_retrieval.'
        : message,
    )
  }

  await upsertPageAccessToken(supabase, input.clinicId, input.integrationId, pageToken)

  try {
    await subscribePageToLeadgen(publicMeta.page_id, pageToken)
  } catch (error) {
    const message = error instanceof HttpError ? error.message : 'Falha ao assinar leadgen'
    await logConnectionEvent(supabase, {
      clinicId: input.clinicId,
      integrationId: input.integrationId,
      eventType: 'lead_capture_subscribe_failed',
      status: 'error',
      message,
      metadata: { page_id: publicMeta.page_id },
      createdBy: input.userId,
    })
    // NÃO marca lead_capture = true
    throw new HttpError(
      error instanceof HttpError ? error.status : 502,
      message,
    )
  }

  const nextConfig = {
    ...mergeIntegrationConfig(currentConfig, {
      ...publicMeta,
      last_status_check_at: new Date().toISOString(),
    }),
    lead_capture: true,
    lead_capture_subscribed_at: new Date().toISOString(),
    lead_capture_field: 'leadgen',
  }

  const { error: updateError } = await supabase
    .from('integrations')
    .update({
      config: nextConfig,
      last_error: null,
      status: 'connected',
    })
    .eq('id', input.integrationId)
    .eq('clinic_id', input.clinicId)

  if (updateError) throw new HttpError(500, 'Falha ao ativar captura de leads')

  await logConnectionEvent(supabase, {
    clinicId: input.clinicId,
    integrationId: input.integrationId,
    eventType: 'lead_capture_enabled',
    status: 'success',
    message: 'Captura Lead Ads ativada (leadgen assinado na Página)',
    metadata: { page_id: publicMeta.page_id },
    createdBy: input.userId,
  })

  return { meta: publicMeta, leadCapture: true }
}

export async function disableLeadCaptureForIntegration(
  supabase: SupabaseClient,
  input: {
    clinicId: string
    integrationId: string
    userId: string
  },
): Promise<{ meta: MetaPublicConfig; leadCapture: boolean }> {
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('id, clinic_id, provider, config')
    .eq('id', input.integrationId)
    .eq('clinic_id', input.clinicId)
    .eq('provider', META_PROVIDER)
    .maybeSingle()

  if (error || !integration) throw new HttpError(404, 'Conexão Meta não encontrada')
  const currentConfig = (integration.config || {}) as Record<string, unknown>
  const publicMeta = readMetaPublicConfig(currentConfig)

  if (publicMeta.page_id) {
    const creds = await readPageAccessToken(supabase, input.clinicId, input.integrationId)
    if (creds?.pageAccessToken) {
      try {
        await unsubscribePageFromLeadgen(publicMeta.page_id, creds.pageAccessToken)
      } catch (unsubError) {
        const message = unsubError instanceof HttpError
          ? unsubError.message
          : 'Falha ao desassinar leadgen'
        console.warn('[meta-leadgen] unsubscribe falhou', JSON.stringify({
          page_id: publicMeta.page_id,
          message,
        }))
        // Continua desligando lead_capture localmente
      }
    }
  }

  const nextConfig = {
    ...mergeIntegrationConfig(currentConfig, publicMeta),
    lead_capture: false,
    lead_capture_subscribed_at: null,
  }

  const { error: updateError } = await supabase
    .from('integrations')
    .update({ config: nextConfig, last_error: null })
    .eq('id', input.integrationId)
    .eq('clinic_id', input.clinicId)

  if (updateError) throw new HttpError(500, 'Falha ao desativar captura de leads')

  await logConnectionEvent(supabase, {
    clinicId: input.clinicId,
    integrationId: input.integrationId,
    eventType: 'lead_capture_disabled',
    status: 'info',
    message: 'Captura Lead Ads desativada',
    metadata: { page_id: publicMeta.page_id },
    createdBy: input.userId,
  })

  return { meta: publicMeta, leadCapture: false }
}

/**
 * Persistência e metadados públicos da conexão Meta.
 *
 * Tokens ficam só em `integration_credentials` (service_role).
 * `integrations.config.meta` guarda apenas ids/nomes e status — legível no app.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { HttpError } from './httpError.ts'
import { generateWebhookSecret, hashSha256Hex } from './metaConnectionCrypto.ts'

export const META_PROVIDER = 'meta'

export type MetaConnectionPhase =
  | 'oauth_pending'
  | 'assets_pending'
  | 'ready'
  | 'expired'
  | 'error'
  | 'disconnected'

export interface MetaPublicConfig {
  meta_user_id: string | null
  page_id: string | null
  page_name: string | null
  instagram_account_id: string | null
  instagram_username: string | null
  ad_account_id: string | null
  ad_account_name: string | null
  token_expires_at: string | null
  connected_at: string | null
  last_status_check_at: string | null
  connection_phase: MetaConnectionPhase
}

export function emptyMetaPublicConfig(
  phase: MetaConnectionPhase = 'disconnected',
): MetaPublicConfig {
  return {
    meta_user_id: null,
    page_id: null,
    page_name: null,
    instagram_account_id: null,
    instagram_username: null,
    ad_account_id: null,
    ad_account_name: null,
    token_expires_at: null,
    connected_at: null,
    last_status_check_at: null,
    connection_phase: phase,
  }
}

export function readMetaPublicConfig(config: Record<string, unknown> | null | undefined): MetaPublicConfig {
  const raw = config && typeof config.meta === 'object' && config.meta !== null
    ? (config.meta as Record<string, unknown>)
    : {}

  const phase = typeof raw.connection_phase === 'string'
    ? (raw.connection_phase as MetaConnectionPhase)
    : 'disconnected'

  return {
    meta_user_id: typeof raw.meta_user_id === 'string' ? raw.meta_user_id : null,
    page_id: typeof raw.page_id === 'string' ? raw.page_id : null,
    page_name: typeof raw.page_name === 'string' ? raw.page_name : null,
    instagram_account_id: typeof raw.instagram_account_id === 'string'
      ? raw.instagram_account_id
      : null,
    instagram_username: typeof raw.instagram_username === 'string'
      ? raw.instagram_username
      : null,
    ad_account_id: typeof raw.ad_account_id === 'string' ? raw.ad_account_id : null,
    ad_account_name: typeof raw.ad_account_name === 'string' ? raw.ad_account_name : null,
    token_expires_at: typeof raw.token_expires_at === 'string' ? raw.token_expires_at : null,
    connected_at: typeof raw.connected_at === 'string' ? raw.connected_at : null,
    last_status_check_at: typeof raw.last_status_check_at === 'string'
      ? raw.last_status_check_at
      : null,
    connection_phase: phase,
  }
}

/** Garante que o objeto público nunca carregue campos de token. */
export function sanitizeMetaPublicConfig(meta: MetaPublicConfig): MetaPublicConfig {
  return { ...meta }
}

export async function logConnectionEvent(
  supabase: SupabaseClient,
  input: {
    clinicId: string
    integrationId: string | null
    eventType: string
    status?: 'info' | 'success' | 'warning' | 'error'
    message?: string | null
    metadata?: Record<string, unknown>
    createdBy?: string | null
  },
): Promise<void> {
  const { error } = await supabase.from('integration_connection_logs').insert({
    clinic_id: input.clinicId,
    integration_id: input.integrationId,
    provider: META_PROVIDER,
    event_type: input.eventType,
    status: input.status || 'info',
    message: input.message ?? null,
    metadata: input.metadata || {},
    created_by: input.createdBy ?? null,
  })
  if (error) console.error('[meta] falha ao gravar connection_log:', error.message)
}

/**
 * Quem pode conectar/desconectar Meta nesta clínica.
 * Usa service_role: não dá para confiar em `auth.uid()` dentro de RPCs.
 * Mesmo critério de `meta-save-channel`: superadmin, dono ou admin.
 */
export async function authorizeClinicIntegrationsManager(
  supabase: SupabaseClient,
  userId: string,
  clinicId: string,
): Promise<{ isSuperadmin: boolean }> {
  const [{ data: role }, { data: membership }, { data: adminRole }] = await Promise.all([
    supabase.from('user_roles').select('role')
      .eq('user_id', userId).eq('role', 'superadmin').maybeSingle(),
    supabase.from('clinic_users').select('clinic_id, is_owner')
      .eq('clinic_id', clinicId).eq('user_id', userId).maybeSingle(),
    supabase.from('user_roles').select('role')
      .eq('user_id', userId).eq('role', 'admin').maybeSingle(),
  ])

  const isSuperadmin = Boolean(role)
  if (isSuperadmin) return { isSuperadmin: true }
  if (!membership) throw new HttpError(403, 'Sem acesso à clínica')
  if (membership.is_owner === true || adminRole) return { isSuperadmin: false }

  throw new HttpError(403, 'Sem permissão para gerenciar Integrações')
}

export async function loadMetaIntegration(
  supabase: SupabaseClient,
  clinicId: string,
  integrationId: string,
) {
  const { data, error } = await supabase
    .from('integrations')
    .select(
      'id, clinic_id, provider, category, name, status, direction, config, credentials_ref, external_account_id, webhook_slug, is_active, last_error',
    )
    .eq('id', integrationId)
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (error) throw new HttpError(500, 'Falha ao carregar integração Meta')
  if (!data || data.provider !== META_PROVIDER) {
    throw new HttpError(404, 'Conexão Meta não encontrada nesta clínica')
  }
  return data
}

export async function upsertMetaCredentials(
  supabase: SupabaseClient,
  input: {
    clinicId: string
    integrationId: string
    accessToken: string
    tokenType: string
    expiresAt: string | null
    scopes: string[]
    metaUserId: string | null
  },
): Promise<string> {
  const { data: existing } = await supabase
    .from('integration_credentials')
    .select('id')
    .eq('integration_id', input.integrationId)
    .eq('clinic_id', input.clinicId)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await supabase
      .from('integration_credentials')
      .update({
        access_token: input.accessToken,
        token_type: input.tokenType,
        expires_at: input.expiresAt,
        scopes: input.scopes,
        meta_user_id: input.metaUserId,
        provider: META_PROVIDER,
      })
      .eq('id', existing.id)
      .eq('clinic_id', input.clinicId)
    if (error) throw new HttpError(500, 'Falha ao atualizar credenciais Meta')
    return existing.id as string
  }

  const { data, error } = await supabase
    .from('integration_credentials')
    .insert({
      clinic_id: input.clinicId,
      integration_id: input.integrationId,
      provider: META_PROVIDER,
      access_token: input.accessToken,
      token_type: input.tokenType,
      expires_at: input.expiresAt,
      scopes: input.scopes,
      meta_user_id: input.metaUserId,
    })
    .select('id')
    .maybeSingle()

  if (error || !data?.id) throw new HttpError(500, 'Falha ao gravar credenciais Meta')
  return data.id as string
}

export async function readMetaAccessToken(
  supabase: SupabaseClient,
  clinicId: string,
  integrationId: string,
): Promise<{
  credentialId: string
  accessToken: string
  expiresAt: string | null
  metaUserId: string | null
} | null> {
  const { data, error } = await supabase
    .from('integration_credentials')
    .select('id, access_token, expires_at, meta_user_id')
    .eq('clinic_id', clinicId)
    .eq('integration_id', integrationId)
    .maybeSingle()

  if (error) throw new HttpError(500, 'Falha ao ler credenciais Meta')
  if (!data?.access_token) return null
  return {
    credentialId: data.id as string,
    accessToken: data.access_token as string,
    expiresAt: (data.expires_at as string | null) ?? null,
    metaUserId: (data.meta_user_id as string | null) ?? null,
  }
}

export async function deleteMetaCredentials(
  supabase: SupabaseClient,
  clinicId: string,
  integrationId: string,
): Promise<void> {
  const { error } = await supabase
    .from('integration_credentials')
    .delete()
    .eq('clinic_id', clinicId)
    .eq('integration_id', integrationId)
  if (error) throw new HttpError(500, 'Falha ao remover credenciais Meta')
}

export async function ensureMetaIntegrationShell(
  supabase: SupabaseClient,
  input: {
    clinicId: string
    userId: string
    integrationId?: string | null
    name?: string
  },
): Promise<{ id: string; created: boolean }> {
  if (input.integrationId) {
    const existing = await loadMetaIntegration(supabase, input.clinicId, input.integrationId)
    return { id: existing.id as string, created: false }
  }

  const { data: current } = await supabase
    .from('integrations')
    .select('id')
    .eq('clinic_id', input.clinicId)
    .eq('provider', META_PROVIDER)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (current?.id) return { id: current.id as string, created: false }

  const slug = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  const webhookSecret = generateWebhookSecret()
  const webhookSecretHash = await hashSha256Hex(webhookSecret)

  const meta = emptyMetaPublicConfig('oauth_pending')
  const { data, error } = await supabase
    .from('integrations')
    .insert({
      clinic_id: input.clinicId,
      provider: META_PROVIDER,
      category: 'ads',
      name: input.name?.trim() || 'Meta',
      description: 'Conexão Facebook e Instagram da clínica',
      status: 'disconnected',
      direction: 'inbound',
      config: { meta, lead_capture: false },
      is_active: true,
      webhook_slug: slug,
      webhook_secret_hash: webhookSecretHash,
      created_by: input.userId,
    })
    .select('id')
    .maybeSingle()

  if (error || !data?.id) {
    // Corrida: outra conexão Meta criada no meio
    const { data: raced } = await supabase
      .from('integrations')
      .select('id')
      .eq('clinic_id', input.clinicId)
      .eq('provider', META_PROVIDER)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (raced?.id) return { id: raced.id as string, created: false }
    throw new HttpError(500, 'Falha ao criar conexão Meta')
  }

  return { id: data.id as string, created: true }
}

export function mergeIntegrationConfig(
  current: Record<string, unknown> | null | undefined,
  meta: MetaPublicConfig,
): Record<string, unknown> {
  const base = current && typeof current === 'object' ? { ...current } : {}
  base.meta = sanitizeMetaPublicConfig(meta)
  // Captação de leads fica desligada nesta etapa
  if (base.lead_capture === undefined) base.lead_capture = false
  return base
}

export function integrationStatusFromPhase(phase: MetaConnectionPhase): string {
  if (phase === 'ready') return 'connected'
  if (phase === 'expired' || phase === 'error') return 'error'
  // OAuth ok, falta escolher Página — não confundir com "desconectada"
  if (phase === 'assets_pending' || phase === 'oauth_pending') return 'paused'
  return 'disconnected'
}

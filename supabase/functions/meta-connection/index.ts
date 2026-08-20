/**
 * Gestão da conexão Meta após o OAuth.
 *
 * POST /meta-connection
 *   action: list_assets | save_assets | refresh_status | disconnect | reconnect_info
 *         | enable_lead_capture | disable_lead_capture
 *
 * Tokens nunca saem desta function. O browser só recebe ids/nomes.
 * Deploy: supabase functions deploy meta-connection
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { HttpError } from '../_shared/httpError.ts'
import {
  authorizeClinicIntegrationsManager,
  deleteMetaCredentials,
  emptyMetaPublicConfig,
  integrationStatusFromPhase,
  loadMetaIntegration,
  logConnectionEvent,
  mergeIntegrationConfig,
  META_PROVIDER,
  readMetaAccessToken,
  readMetaPublicConfig,
  type MetaPublicConfig,
} from '../_shared/metaConnection.ts'
import {
  disableLeadCaptureForIntegration,
  enableLeadCaptureForIntegration,
} from '../_shared/metaLeadAds.ts'
import {
  META_ASSETS_UNAVAILABLE,
  listMetaPages,
  probeMetaToken,
} from '../_shared/metaGraph.ts'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), ...JSON_HEADERS },
  })
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new HttpError(503, 'Serviço não configurado')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function requireUser(req: Request) {
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!bearer) throw new HttpError(401, 'Não autenticado')
  const supabase = serviceClient()
  const { data: { user }, error } = await supabase.auth.getUser(bearer)
  if (error || !user) throw new HttpError(401, 'Sessão inválida')
  return { supabase, user }
}

async function applyMetaConfig(
  supabase: ReturnType<typeof serviceClient>,
  integrationId: string,
  clinicId: string,
  currentConfig: Record<string, unknown>,
  meta: MetaPublicConfig,
  extra: { status?: string; lastError?: string | null; credentialsRef?: string | null; externalAccountId?: string | null } = {},
) {
  const patch: Record<string, unknown> = {
    config: mergeIntegrationConfig(currentConfig, meta),
    status: extra.status ?? integrationStatusFromPhase(meta.connection_phase),
    last_error: extra.lastError === undefined ? undefined : extra.lastError,
  }
  if (extra.credentialsRef !== undefined) patch.credentials_ref = extra.credentialsRef
  if (extra.externalAccountId !== undefined) patch.external_account_id = extra.externalAccountId

  // Remove undefined keys
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) delete patch[key]
  }

  const { error } = await supabase
    .from('integrations')
    .update(patch)
    .eq('id', integrationId)
    .eq('clinic_id', clinicId)
  if (error) throw new HttpError(500, 'Falha ao atualizar conexão Meta')
}

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options
  if (req.method !== 'POST') return json(req, { error: 'Método não permitido' }, 405)

  try {
    const { supabase, user } = await requireUser(req)
    const body = await req.json().catch(() => null) as {
      action?: string
      clinic_id?: unknown
      integration_id?: unknown
      page_id?: unknown
      instagram_account_id?: unknown
      ad_account_id?: unknown
    } | null

    if (!body?.action) throw new HttpError(400, 'action obrigatória')
    if (!isUuid(body.clinic_id)) throw new HttpError(400, 'clinic_id inválido')
    if (!isUuid(body.integration_id)) throw new HttpError(400, 'integration_id inválido')

    await authorizeClinicIntegrationsManager(supabase, user.id, body.clinic_id)
    const integration = await loadMetaIntegration(supabase, body.clinic_id, body.integration_id)
    const currentConfig = (integration.config || {}) as Record<string, unknown>
    const publicMeta = readMetaPublicConfig(currentConfig)

    if (body.action === 'list_assets') {
      console.log('[meta-connection] list_assets start', JSON.stringify({
        clinic_id: body.clinic_id,
        integration_id: body.integration_id,
        user_id: user.id,
        phase: publicMeta.connection_phase,
      }))

      const creds = await readMetaAccessToken(supabase, body.clinic_id, body.integration_id)
      if (!creds) {
        console.error('[meta-connection] list_assets sem credenciais', JSON.stringify({
          clinic_id: body.clinic_id,
          integration_id: body.integration_id,
        }))
        throw new HttpError(409, 'Conexão Meta sem credenciais — reconecte')
      }

      // Nesta etapa só Páginas; Instagram/anúncios exigem permissões ainda ausentes no app.
      let pages
      try {
        pages = await listMetaPages(creds.accessToken)
      } catch (graphError) {
        const message = graphError instanceof HttpError
          ? graphError.message
          : 'Falha ao listar Páginas na Graph API'
        console.error('[meta-connection] list_assets graph_error', JSON.stringify({
          clinic_id: body.clinic_id,
          integration_id: body.integration_id,
          message,
        }))
        await logConnectionEvent(supabase, {
          clinicId: body.clinic_id,
          integrationId: body.integration_id,
          eventType: 'list_assets_failed',
          status: 'error',
          message,
          metadata: { step: 'list_meta_pages' },
          createdBy: user.id,
        })
        throw graphError instanceof HttpError
          ? graphError
          : new HttpError(502, message)
      }

      console.log('[meta-connection] list_assets ok', JSON.stringify({
        clinic_id: body.clinic_id,
        integration_id: body.integration_id,
        page_count: pages.length,
        has_meta_user: Boolean(creds.metaUserId),
        token_expires_at: creds.expiresAt,
      }))

      return json(req, {
        pages: pages.map((p) => ({ id: p.id, name: p.name, tasks: p.tasks })),
        instagramAccounts: [],
        adAccounts: [],
        unavailable: META_ASSETS_UNAVAILABLE,
        lead_capture: currentConfig.lead_capture === true,
        lead_capture_subscribed_at:
          typeof currentConfig.lead_capture_subscribed_at === 'string'
            ? currentConfig.lead_capture_subscribed_at
            : null,
        selection: {
          page_id: publicMeta.page_id,
          instagram_account_id: null,
          ad_account_id: null,
        },
      })
    }

    if (body.action === 'save_assets') {
      if (typeof body.page_id !== 'string' || !body.page_id.trim()) {
        throw new HttpError(400, 'Selecione uma Página do Facebook')
      }

      const creds = await readMetaAccessToken(supabase, body.clinic_id, body.integration_id)
      if (!creds) throw new HttpError(409, 'Conexão Meta sem credenciais — reconecte')

      const pages = await listMetaPages(creds.accessToken)
      const page = pages.find((p) => p.id === body.page_id)
      if (!page) throw new HttpError(400, 'Página não pertence a esta conta Meta')

      // Instagram / anúncios: não aceitar nesta etapa (sem permissões no app Meta).
      if (typeof body.instagram_account_id === 'string' && body.instagram_account_id.trim()) {
        throw new HttpError(
          400,
          'Seleção de Instagram indisponível até o app Meta ter a permissão correspondente',
        )
      }
      if (typeof body.ad_account_id === 'string' && body.ad_account_id.trim()) {
        throw new HttpError(
          400,
          'Seleção de conta de anúncios indisponível até o app Meta ter a permissão correspondente',
        )
      }

      const nextMeta: MetaPublicConfig = {
        ...publicMeta,
        meta_user_id: creds.metaUserId,
        page_id: page.id,
        page_name: page.name,
        instagram_account_id: null,
        instagram_username: null,
        ad_account_id: null,
        ad_account_name: null,
        token_expires_at: creds.expiresAt,
        connected_at: publicMeta.connected_at || new Date().toISOString(),
        last_status_check_at: new Date().toISOString(),
        connection_phase: 'ready',
      }

      await applyMetaConfig(supabase, body.integration_id, body.clinic_id, currentConfig, nextMeta, {
        status: 'connected',
        lastError: null,
        externalAccountId: page.id,
      })

      await logConnectionEvent(supabase, {
        clinicId: body.clinic_id,
        integrationId: body.integration_id,
        eventType: 'assets_selected',
        status: 'success',
        message: 'Página Meta salva na conexão da clínica',
        metadata: {
          page_id: page.id,
          page_name: page.name,
        },
        createdBy: user.id,
      })

      return json(req, { ok: true, meta: nextMeta })
    }

    if (body.action === 'refresh_status') {
      const creds = await readMetaAccessToken(supabase, body.clinic_id, body.integration_id)
      const now = new Date().toISOString()

      if (!creds) {
        const nextMeta = {
          ...publicMeta,
          connection_phase: 'disconnected' as const,
          last_status_check_at: now,
        }
        await applyMetaConfig(supabase, body.integration_id, body.clinic_id, currentConfig, nextMeta, {
          status: 'disconnected',
          lastError: 'Credenciais ausentes',
        })
        return json(req, { ok: false, meta: nextMeta, reason: 'missing_credentials' })
      }

      const expiredByDate = creds.expiresAt
        && new Date(creds.expiresAt).getTime() <= Date.now()
      const probe = await probeMetaToken(creds.accessToken)

      if (!probe.ok || expiredByDate) {
        const nextMeta: MetaPublicConfig = {
          ...publicMeta,
          connection_phase: 'expired',
          last_status_check_at: now,
        }
        await applyMetaConfig(supabase, body.integration_id, body.clinic_id, currentConfig, nextMeta, {
          status: 'error',
          lastError: probe.errorMessage || 'Token Meta expirado',
        })
        await logConnectionEvent(supabase, {
          clinicId: body.clinic_id,
          integrationId: body.integration_id,
          eventType: 'token_expired',
          status: 'warning',
          message: probe.errorMessage || 'Token Meta expirado',
          createdBy: user.id,
        })
        return json(req, { ok: false, meta: nextMeta, reason: 'expired' })
      }

      const phase = publicMeta.page_id ? 'ready' : 'assets_pending'
      const nextMeta: MetaPublicConfig = {
        ...publicMeta,
        meta_user_id: probe.metaUserId,
        connection_phase: phase,
        last_status_check_at: now,
        token_expires_at: creds.expiresAt,
      }
      await applyMetaConfig(supabase, body.integration_id, body.clinic_id, currentConfig, nextMeta, {
        status: integrationStatusFromPhase(phase),
        lastError: null,
      })
      await logConnectionEvent(supabase, {
        clinicId: body.clinic_id,
        integrationId: body.integration_id,
        eventType: 'status_refreshed',
        status: 'success',
        message: 'Status da conexão Meta atualizado',
        createdBy: user.id,
      })
      return json(req, { ok: true, meta: nextMeta })
    }

    if (body.action === 'enable_lead_capture') {
      const result = await enableLeadCaptureForIntegration(supabase, {
        clinicId: body.clinic_id,
        integrationId: body.integration_id,
        userId: user.id,
      })
      return json(req, {
        ok: true,
        lead_capture: result.leadCapture,
        meta: result.meta,
      })
    }

    if (body.action === 'disable_lead_capture') {
      const result = await disableLeadCaptureForIntegration(supabase, {
        clinicId: body.clinic_id,
        integrationId: body.integration_id,
        userId: user.id,
      })
      return json(req, {
        ok: true,
        lead_capture: result.leadCapture,
        meta: result.meta,
      })
    }

    if (body.action === 'disconnect') {
      // Melhor esforço: desassina leadgen antes de apagar tokens
      if (currentConfig.lead_capture === true) {
        try {
          await disableLeadCaptureForIntegration(supabase, {
            clinicId: body.clinic_id,
            integrationId: body.integration_id,
            userId: user.id,
          })
        } catch (disableError) {
          console.warn('[meta-connection] disable_lead_capture no disconnect',
            disableError instanceof Error ? disableError.message : 'erro')
        }
      }

      await deleteMetaCredentials(supabase, body.clinic_id, body.integration_id)
      const nextMeta = emptyMetaPublicConfig('disconnected')
      const clearedConfig = {
        ...mergeIntegrationConfig(currentConfig, nextMeta),
        lead_capture: false,
        lead_capture_subscribed_at: null,
      }
      const { error: disconnectError } = await supabase
        .from('integrations')
        .update({
          config: clearedConfig,
          status: 'disconnected',
          last_error: null,
          credentials_ref: null,
          external_account_id: null,
        })
        .eq('id', body.integration_id)
        .eq('clinic_id', body.clinic_id)
      if (disconnectError) throw new HttpError(500, 'Falha ao desconectar Meta')

      await logConnectionEvent(supabase, {
        clinicId: body.clinic_id,
        integrationId: body.integration_id,
        eventType: 'disconnected',
        status: 'info',
        message: 'Conexão Meta desconectada',
        createdBy: user.id,
      })
      return json(req, { ok: true, meta: nextMeta, lead_capture: false })
    }

    if (body.action === 'reconnect_info') {
      return json(req, {
        provider: META_PROVIDER,
        integrationId: body.integration_id,
        meta: publicMeta,
        lead_capture: currentConfig.lead_capture === true,
        needsOAuth: true,
        message: 'Use meta-oauth action=start com este integration_id para reconectar',
      })
    }

    throw new HttpError(400, `action desconhecida: ${body.action}`)
  } catch (error) {
    if (error instanceof HttpError) return json(req, { error: error.message }, error.status)
    console.error('[meta-connection] erro inesperado', error)
    return json(req, { error: 'Erro interno' }, 500)
  }
})

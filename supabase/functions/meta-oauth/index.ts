/**
 * OAuth Meta (Facebook + Instagram) — início e callback.
 *
 * POST /meta-oauth  { action: 'start', clinic_id, integration_id? }
 *   → { authorizationUrl, integrationId }
 *
 * GET  /meta-oauth/callback?code=&state=
 *   → redireciona para APP_URL/integracoes?meta=...
 *
 * Tokens nunca voltam ao browser: ficam em integration_credentials.
 * Deploy: supabase functions deploy meta-oauth
 *         (callback público: deploy com --no-verify-jwt)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { HttpError } from '../_shared/httpError.ts'
import {
  authorizeClinicIntegrationsManager,
  ensureMetaIntegrationShell,
  integrationStatusFromPhase,
  logConnectionEvent,
  mergeIntegrationConfig,
  META_PROVIDER,
  readMetaPublicConfig,
  upsertMetaCredentials,
} from '../_shared/metaConnection.ts'
import { randomNonce } from '../_shared/metaConnectionCrypto.ts'
import {
  buildMetaOAuthUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  expiresAtFromSeconds,
  fetchMetaUser,
  META_OAUTH_SCOPES,
} from '../_shared/metaGraph.ts'

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

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

function appBaseUrl(): string {
  const appUrl = Deno.env.get('APP_URL')?.replace(/\/$/, '')
  if (!appUrl) throw new HttpError(503, 'APP_URL não configurada')
  return appUrl
}

/**
 * redirect_uri canônica do OAuth Meta.
 *
 * Facebook exige match byte-a-byte com a URL cadastrada (sem barra final).
 * - Normaliza trim + remove `/` final.
 * - Canônico = `{SUPABASE_URL}/functions/v1/meta-oauth/callback`
 * - Se `META_OAUTH_REDIRECT_URI` existir e diferir do canônico, usa o canônico
 *   (evita "URL bloqueada" por secret com typo/barra extra) e registra o aviso.
 * Start OAuth e troca do code devem chamar esta mesma função.
 */
function oauthRedirectUri(): string {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim().replace(/\/+$/, '')
  if (!supabaseUrl) throw new HttpError(503, 'SUPABASE_URL não configurada')

  const canonical = `${supabaseUrl}/functions/v1/meta-oauth/callback`
  const explicitRaw = Deno.env.get('META_OAUTH_REDIRECT_URI')
  const explicit = explicitRaw?.trim().replace(/\/+$/, '') || null

  if (explicit && explicit !== canonical) {
    console.warn(
      '[meta-oauth] META_OAUTH_REDIRECT_URI difere do canônico; usando canônico',
      JSON.stringify({ explicit, canonical }),
    )
  } else if (explicitRaw != null && explicitRaw !== explicit) {
    console.warn(
      '[meta-oauth] META_OAUTH_REDIRECT_URI tinha espaços ou barra final; normalizado',
      JSON.stringify({ canonical }),
    )
  }

  // Sempre o canônico do projeto (igual ao cadastro no Meta Developers)
  const redirectUri = canonical
  // Log temporário de diagnóstico — só a URI, sem tokens/code/state
  console.log('[meta-oauth] redirect_uri=', redirectUri)
  return redirectUri
}

function metaAppCredentials(): { appId: string; appSecret: string } {
  const appId = Deno.env.get('META_APP_ID')?.trim()
  const appSecret = Deno.env.get('META_APP_SECRET')?.trim()
  if (!appId || !appSecret) {
    throw new HttpError(503, 'META_APP_ID / META_APP_SECRET não configurados')
  }
  return { appId, appSecret }
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function redirectToApp(query: Record<string, string>): Response {
  const url = new URL(`${appBaseUrl()}/integracoes`)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  return Response.redirect(url.toString(), 302)
}

async function handleStart(req: Request): Promise<Response> {
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!bearer) throw new HttpError(401, 'Não autenticado')

  const supabase = serviceClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser(bearer)
  if (authError || !user) throw new HttpError(401, 'Sessão inválida')

  const body = await req.json().catch(() => null) as {
    action?: string
    clinic_id?: unknown
    integration_id?: unknown
  } | null

  if (!body || body.action !== 'start') throw new HttpError(400, 'action inválida')
  if (!isUuid(body.clinic_id)) throw new HttpError(400, 'clinic_id inválido')
  if (body.integration_id != null && !isUuid(body.integration_id)) {
    throw new HttpError(400, 'integration_id inválido')
  }

  await authorizeClinicIntegrationsManager(supabase, user.id, body.clinic_id)

  const shell = await ensureMetaIntegrationShell(supabase, {
    clinicId: body.clinic_id,
    userId: user.id,
    integrationId: body.integration_id ?? null,
  })

  const nonce = randomNonce(32)
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString()

  const { error: stateError } = await supabase.from('integration_oauth_states').insert({
    clinic_id: body.clinic_id,
    user_id: user.id,
    provider: META_PROVIDER,
    nonce,
    integration_id: shell.id,
    redirect_path: '/integracoes',
    expires_at: expiresAt,
  })
  if (stateError) throw new HttpError(500, 'Falha ao iniciar OAuth Meta')

  const redirectUri = oauthRedirectUri()

  await logConnectionEvent(supabase, {
    clinicId: body.clinic_id,
    integrationId: shell.id,
    eventType: 'oauth_started',
    status: 'info',
    message: 'Fluxo OAuth Meta iniciado',
    metadata: { redirect_uri: redirectUri },
    createdBy: user.id,
  })

  const { appId } = metaAppCredentials()
  const authorizationUrl = buildMetaOAuthUrl({
    appId,
    redirectUri,
    state: nonce,
  })

  return json(req, {
    authorizationUrl,
    integrationId: shell.id,
    redirectUri,
    scopes: META_OAUTH_SCOPES.split(','),
  })
}

async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')
  const oauthErrorDescription = url.searchParams.get('error_description')

  if (oauthError) {
    return redirectToApp({
      meta: 'error',
      reason: oauthErrorDescription || oauthError,
    })
  }
  if (!code || !state) {
    return redirectToApp({ meta: 'error', reason: 'callback_incompleto' })
  }

  const supabase = serviceClient()
  const { data: oauthState, error: stateError } = await supabase
    .from('integration_oauth_states')
    .select('id, clinic_id, user_id, integration_id, expires_at, consumed_at')
    .eq('nonce', state)
    .eq('provider', META_PROVIDER)
    .maybeSingle()

  if (stateError || !oauthState) {
    return redirectToApp({ meta: 'error', reason: 'state_invalido' })
  }
  if (oauthState.consumed_at) {
    return redirectToApp({ meta: 'error', reason: 'state_reutilizado' })
  }
  if (new Date(oauthState.expires_at).getTime() <= Date.now()) {
    return redirectToApp({ meta: 'error', reason: 'state_expirado' })
  }
  if (!oauthState.integration_id) {
    return redirectToApp({ meta: 'error', reason: 'integracao_ausente' })
  }

  await supabase
    .from('integration_oauth_states')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', oauthState.id)

  try {
    const { appId, appSecret } = metaAppCredentials()
    // Mesma redirect_uri do dialog OAuth (obrigatório na troca do code)
    const redirectUri = oauthRedirectUri()
    const shortLived = await exchangeCodeForToken({
      code,
      redirectUri,
      appId,
      appSecret,
    })
    const longLived = await exchangeForLongLivedToken({
      shortLivedToken: shortLived.accessToken,
      appId,
      appSecret,
    })
    const metaUser = await fetchMetaUser(longLived.accessToken)
    const expiresAt = expiresAtFromSeconds(longLived.expiresIn)

    const credentialId = await upsertMetaCredentials(supabase, {
      clinicId: oauthState.clinic_id,
      integrationId: oauthState.integration_id,
      accessToken: longLived.accessToken,
      tokenType: longLived.tokenType,
      expiresAt,
      scopes: META_OAUTH_SCOPES.split(','),
      metaUserId: metaUser.id,
    })

    const { data: integration } = await supabase
      .from('integrations')
      .select('config')
      .eq('id', oauthState.integration_id)
      .eq('clinic_id', oauthState.clinic_id)
      .maybeSingle()

    const currentConfig = (integration?.config || {}) as Record<string, unknown>
    const previous = readMetaPublicConfig(currentConfig)
    const currentMeta = {
      ...previous,
      meta_user_id: metaUser.id,
      token_expires_at: expiresAt,
      connected_at: previous.connected_at || new Date().toISOString(),
      last_status_check_at: new Date().toISOString(),
      // Mantém ativos já escolhidos em reconexão; senão pede seleção
      connection_phase: previous.page_id ? 'ready' as const : 'assets_pending' as const,
    }

    const { error: updateError } = await supabase
      .from('integrations')
      .update({
        credentials_ref: credentialId,
        status: integrationStatusFromPhase(currentMeta.connection_phase),
        last_error: null,
        config: mergeIntegrationConfig(currentConfig, currentMeta),
      })
      .eq('id', oauthState.integration_id)
      .eq('clinic_id', oauthState.clinic_id)

    if (updateError) throw new HttpError(500, 'Falha ao atualizar conexão Meta')

    await logConnectionEvent(supabase, {
      clinicId: oauthState.clinic_id,
      integrationId: oauthState.integration_id,
      eventType: 'oauth_completed',
      status: 'success',
      message: 'OAuth Meta concluído — selecione a Página do Facebook',
      metadata: { meta_user_id: metaUser.id },
      createdBy: oauthState.user_id,
    })

    return redirectToApp({
      meta: currentMeta.connection_phase === 'ready' ? 'connected' : 'assets',
      integration_id: oauthState.integration_id,
    })
  } catch (error) {
    const message = error instanceof HttpError ? error.message : 'Falha no callback Meta'
    await logConnectionEvent(supabase, {
      clinicId: oauthState.clinic_id,
      integrationId: oauthState.integration_id,
      eventType: 'oauth_failed',
      status: 'error',
      message,
      createdBy: oauthState.user_id,
    })

    const { data: integration } = await supabase
      .from('integrations')
      .select('config')
      .eq('id', oauthState.integration_id)
      .eq('clinic_id', oauthState.clinic_id)
      .maybeSingle()
    const currentConfig = (integration?.config || {}) as Record<string, unknown>
    const failedMeta = {
      ...readMetaPublicConfig(currentConfig),
      connection_phase: 'error' as const,
      last_status_check_at: new Date().toISOString(),
    }

    await supabase
      .from('integrations')
      .update({
        status: 'error',
        last_error: message,
        config: mergeIntegrationConfig(currentConfig, failedMeta),
      })
      .eq('id', oauthState.integration_id)
      .eq('clinic_id', oauthState.clinic_id)

    return redirectToApp({ meta: 'error', reason: message })
  }
}

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options

  try {
    const path = new URL(req.url).pathname
    const isCallback = path.endsWith('/callback') || path.includes('/meta-oauth/callback')

    if (req.method === 'GET' && isCallback) return await handleCallback(req)
    if (req.method === 'POST') return await handleStart(req)

    return json(req, { error: 'Método não permitido' }, 405)
  } catch (error) {
    if (error instanceof HttpError) return json(req, { error: error.message }, error.status)
    console.error('[meta-oauth] erro inesperado', error)
    return json(req, { error: 'Erro interno' }, 500)
  }
})

/**
 * Captação pública do Smart Hub → CRM.
 *
 * Deploy: `npx supabase functions deploy smart-hub-capture --no-verify-jwt`
 *
 * Causa histórica de falha ao visitante: após `ingestLead` ter sucesso,
 * erros em atividade/analytics/notificação derrubavam a resposta (HTTP 500),
 * e o frontend engolia o corpo do erro mostrando mensagem genérica.
 */
import { serviceClient } from '../_shared/integrations.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { HttpError } from '../_shared/httpError.ts'
import { assertRateLimit } from '../_shared/rateLimit.ts'
import { assertClinicModules } from '../_shared/clinicAccess.ts'
import { ingestLead } from '../_shared/leads.ts'
import {
  newRequestId,
  normalizePhoneDigits,
  resolveCaptureConfigEdge,
} from '../_shared/smartHubCaptureResolve.ts'

const MAX_BODY_BYTES = 50_000
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60_000

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

function asString(value: unknown, max = 500): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function sanitizeText(value: unknown, max = 1000): string | null {
  const text = asString(value, max)
  return text || null
}

function logCapture(
  level: 'info' | 'warn' | 'error',
  payload: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    scope: 'smart-hub-capture',
    level,
    ts: new Date().toISOString(),
    ...payload,
  })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options

  const requestId = newRequestId()

  if (req.method !== 'POST') {
    return json(req, {
      ok: false,
      code: 'method_not_allowed',
      message: 'Método não permitido',
      request_id: requestId,
    }, 405)
  }

  let slugForLog = ''
  let buttonIdForLog: string | null = null
  let step = 'parse_body'

  try {
    const contentLength = Number(req.headers.get('content-length') || 0)
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Payload muito grande', 'payload_too_large')
    }

    const raw = await req.text()
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Payload muito grande', 'payload_too_large')
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(raw || '{}') as Record<string, unknown>
    } catch {
      throw new HttpError(400, 'JSON inválido', 'invalid_json')
    }

    const action = asString(body.action, 40) || 'submit'

    // Honeypot
    if (asString(body.website) || asString(body.company_url)) {
      return json(req, {
        ok: true,
        result: 'created',
        message: 'Recebemos seus dados.',
        request_id: requestId,
      })
    }

    const slug = asString(body.slug, 120).toLowerCase()
    slugForLog = slug
    if (!slug) throw new HttpError(400, 'Hub inválido', 'hub_unavailable')

    const ip =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown'

    step = 'rate_limit'
    try {
      assertRateLimit(`sh-capture:${slug}:${ip}`, RATE_LIMIT, RATE_WINDOW_MS)
    } catch (err) {
      if (err instanceof HttpError) {
        throw new HttpError(429, 'Muitas tentativas foram realizadas. Aguarde um momento.', 'rate_limited')
      }
      throw err
    }

    step = 'load_hub'
    const supabase = serviceClient()

    const { data: hub, error: hubError } = await supabase
      .from('smart_hubs')
      .select('id, clinic_id, slug, title, status, capture_config, template_id, style_preset, whatsapp_number')
      .eq('slug', slug)
      .is('deleted_at', null)
      .maybeSingle()

    if (hubError) {
      logCapture('error', {
        request_id: requestId,
        step,
        code: hubError.code,
        slug,
      })
      throw new HttpError(500, 'Não foi possível enviar agora. Tente novamente.', 'server_error')
    }
    if (!hub) throw new HttpError(404, 'Este formulário não está disponível agora.', 'hub_unavailable')
    if (hub.status !== 'published' && action !== 'validate' && action !== 'test') {
      throw new HttpError(403, 'Este formulário não está disponível agora.', 'hub_unavailable')
    }

    step = 'load_clinic'
    const { data: clinic } = await supabase
      .from('clinics')
      .select('id, name, is_active')
      .eq('id', hub.clinic_id)
      .maybeSingle()

    if (!clinic || clinic.is_active === false) {
      throw new HttpError(403, 'Este formulário não está disponível agora.', 'clinic_unavailable')
    }

    step = 'assert_modules'
    try {
      await assertClinicModules(supabase, hub.clinic_id, ['smart_hub', 'crm'])
    } catch (err) {
      if (err instanceof HttpError) {
        throw new HttpError(
          err.status,
          'O atendimento por formulário está temporariamente indisponível.',
          err.status === 403 ? 'module_unavailable' : 'capture_not_configured',
        )
      }
      throw err
    }

    const buttonId = asString(body.button_id, 80) || null
    buttonIdForLog = buttonId
    let buttonCapture: Record<string, unknown> = {}
    let buttonTitle: string | null = null

    if (buttonId) {
      step = 'load_button'
      const { data: button } = await supabase
        .from('smart_hub_buttons')
        .select('id, title, click_action, capture_config, hub_id, clinic_id')
        .eq('id', buttonId)
        .eq('hub_id', hub.id)
        .eq('clinic_id', hub.clinic_id)
        .is('deleted_at', null)
        .maybeSingle()

      if (button) {
        buttonTitle = button.title
        if (
          button.capture_config &&
          typeof button.capture_config === 'object' &&
          !Array.isArray(button.capture_config)
        ) {
          buttonCapture = button.capture_config as Record<string, unknown>
        }
      }
    }

    const resolved = resolveCaptureConfigEdge(hub.capture_config, buttonCapture)

    // ---- validate (sem criar lead) ----
    if (action === 'validate') {
      step = 'validate'
      const issues: string[] = []
      if (hub.status !== 'published') issues.push('Publique o Smart Hub antes de receber contatos.')
      if (!resolved.initial_stage) issues.push('Etapa inicial inválida.')
      if (resolved.redirect_whatsapp_after_submit) {
        const phone =
          resolved.whatsapp_phone ||
          normalizePhoneDigits(String(hub.whatsapp_number || ''))
        if (!phone) {
          issues.push('Informe o telefone do WhatsApp para redirecionamento após o envio.')
        }
      }

      const ready = issues.length === 0 && hub.status === 'published'
      logCapture('info', {
        request_id: requestId,
        step,
        slug,
        button_id: buttonId,
        ready,
        issue_count: issues.length,
      })
      return json(req, {
        ok: ready,
        ready,
        issues,
        message: ready
          ? 'Formulário pronto para receber contatos.'
          : 'Corrija os seguintes itens:',
        summary: {
          stage: resolved.initial_stage,
          has_owner: Boolean(resolved.owner_user_id),
          redirect_whatsapp: resolved.redirect_whatsapp_after_submit,
          using_hub_defaults: resolved.using_hub_defaults,
        },
        request_id: requestId,
      })
    }

    const isTest = action === 'test'
    if (isTest) {
      step = 'auth_test'
      const authHeader = req.headers.get('Authorization') || ''
      const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
      if (!jwt) {
        throw new HttpError(401, 'Autenticação necessária para o teste.', 'unauthorized')
      }
      const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
      if (userErr || !userData?.user) {
        throw new HttpError(401, 'Autenticação necessária para o teste.', 'unauthorized')
      }
      const { data: membership } = await supabase
        .from('clinic_users')
        .select('user_id')
        .eq('clinic_id', hub.clinic_id)
        .eq('user_id', userData.user.id)
        .maybeSingle()
      if (!membership) {
        throw new HttpError(403, 'Sem permissão para testar este hub.', 'forbidden')
      }
    }

    step = 'validate_fields'
    if (resolved.require_privacy_accept && body.privacy_accepted !== true && !isTest) {
      throw new HttpError(400, 'Autorize o uso dos dados para continuar.', 'consent_required')
    }

    const name = isTest
      ? asString(body.name, 120) || `TESTE Smart Hub ${new Date().toISOString().slice(0, 16)}`
      : asString(body.name ?? body.nome, 120)
    const phone = isTest
      ? asString(body.phone, 40) || '5500000000000'
      : asString(body.phone ?? body.whatsapp ?? body.telefone, 40)

    if (!name) throw new HttpError(400, 'Informe seu nome.', 'invalid_name')
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      throw new HttpError(400, 'Informe um WhatsApp válido.', 'invalid_phone')
    }

    const email = sanitizeText(body.email, 160)
    const interest =
      sanitizeText(body.interest ?? body.servico ?? body.service, 200) ||
      resolved.interest
    const message = sanitizeText(body.message ?? body.mensagem, 1500)
    const preferredTime = sanitizeText(body.preferred_time ?? body.melhor_horario, 120)
    const preferredDate = sanitizeText(body.preferred_date ?? body.data_preferida, 40)

    const stage = resolved.initial_stage
    const ownerUserId = resolved.owner_user_id

    const notesParts = [
      isTest ? '⚠️ LEAD DE TESTE — Smart Hub (pode excluir)' : null,
      message ? `Mensagem: ${message}` : null,
      preferredTime ? `Melhor horário: ${preferredTime}` : null,
      preferredDate ? `Data preferida: ${preferredDate}` : null,
      buttonTitle ? `Botão: ${buttonTitle}` : null,
      `Origem: Smart Hub (${hub.slug})`,
    ].filter(Boolean)

    const sourceDetail = isTest ? 'smart_hub_test' : 'smart_hub_form'

    const sourcePayload = {
      provider: 'smart_hub',
      source: 'smart_hub',
      source_detail: sourceDetail,
      hub_id: hub.id,
      hub_slug: hub.slug,
      hub_title: hub.title,
      button_id: buttonId,
      button_title: buttonTitle,
      template_id: hub.template_id,
      style_preset: hub.style_preset,
      referrer: sanitizeText(body.referrer, 500),
      landing_url: sanitizeText(body.landing_url, 500),
      utm_source: sanitizeText(body.utm_source, 120),
      utm_medium: sanitizeText(body.utm_medium, 120),
      utm_campaign: sanitizeText(body.utm_campaign, 120),
      utm_content: sanitizeText(body.utm_content, 120),
      utm_term: sanitizeText(body.utm_term, 120),
      device_type: sanitizeText(body.device_type, 40),
      privacy_accepted: true,
      privacy_accepted_at: new Date().toISOString(),
      privacy_version: resolved.privacy_version,
      preferred_time: preferredTime,
      preferred_date: preferredDate,
      is_test: isTest,
    }

    step = 'ingest_lead'
    logCapture('info', {
      request_id: requestId,
      step,
      slug,
      button_id: buttonId,
      stage,
      has_owner: Boolean(ownerUserId),
      using_hub_defaults: resolved.using_hub_defaults,
      is_test: isTest,
    })

    const result = await ingestLead(supabase, {
      clinicId: hub.clinic_id,
      integrationId: null,
      provider: 'smart_hub',
      defaultLeadSource: 'smart_hub',
      dedupe: isTest ? 'none' : 'auto',
      ownerUserId: ownerUserId || undefined,
      // Teste admin: não mascara falha de schema (ex.: PGRST204 / PRODUCAO_34)
      diagnosticMode: isTest,
      payload: {
        name,
        phone,
        email,
        interest,
        notes: notesParts.join('\n'),
        stage,
        source: 'smart_hub',
        ...sourcePayload,
      },
    })

    // Lead já persistido — falhas secundárias NÃO podem falhar a resposta ao visitante
    step = 'secondary_activity'
    try {
      const activityType = result.created
        ? 'smart_hub_form_submitted'
        : 'smart_hub_contact_updated'
      const activityDesc = result.created
        ? isTest
          ? 'Lead de teste criado pelo Smart Hub'
          : 'Lead criado pelo Smart Hub'
        : 'Novo contato recebido pelo Smart Hub'

      const { error: actErr } = await supabase.rpc('add_crm_lead_activity', {
        p_lead_id: result.leadId,
        p_activity_type: activityType,
        p_description: activityDesc,
        p_result: null,
        p_origin: 'smart_hub',
        p_metadata: {
          hub_id: hub.id,
          button_id: buttonId,
          duplicate: result.duplicate,
          matched_by: result.matchedBy,
          is_test: isTest,
          request_id: requestId,
        },
      })
      if (actErr) {
        logCapture('warn', {
          request_id: requestId,
          step: 'secondary_activity',
          code: actErr.code,
          slug,
          button_id: buttonId,
        })
      }
    } catch (secErr) {
      logCapture('warn', {
        request_id: requestId,
        step: 'secondary_activity',
        slug,
        button_id: buttonId,
        error: secErr instanceof Error ? secErr.message : 'unknown',
      })
    }

    step = 'secondary_analytics'
    try {
      const { error: evErr } = await supabase.from('smart_hub_events').insert({
        clinic_id: hub.clinic_id,
        hub_id: hub.id,
        event_type: result.created
          ? isTest
            ? 'form_test'
            : 'form_submitted'
          : 'form_duplicate',
        event_name: buttonTitle || 'Captura Smart Hub',
        payload: {
          button_id: buttonId,
          lead_created: result.created,
          duplicate: result.duplicate,
          is_test: isTest,
          request_id: requestId,
        },
        status: 'active',
      })
      if (evErr) {
        logCapture('warn', {
          request_id: requestId,
          step: 'secondary_analytics',
          code: evErr.code,
          slug,
          button_id: buttonId,
        })
      }
    } catch (secErr) {
      logCapture('warn', {
        request_id: requestId,
        step: 'secondary_analytics',
        slug,
        button_id: buttonId,
        error: secErr instanceof Error ? secErr.message : 'unknown',
      })
    }

    step = 'secondary_notify'
    try {
      await supabase.rpc('notify_clinic_crm_users', {
        p_clinic_id: hub.clinic_id,
        p_title: result.created
          ? isTest
            ? 'Lead de teste — Smart Hub'
            : 'Novo lead pelo Smart Hub'
          : 'Contato atualizado pelo Smart Hub',
        p_message: [name, interest ? `Interesse: ${interest}` : null, 'Origem: Smart Hub']
          .filter(Boolean)
          .join(' · '),
        p_reference_id: result.leadId,
        p_owner_user_id: ownerUserId,
      })
    } catch (secErr) {
      logCapture('warn', {
        request_id: requestId,
        step: 'secondary_notify',
        slug,
        button_id: buttonId,
        error: secErr instanceof Error ? secErr.message : 'unknown',
      })
    }

    let whatsappUrl: string | null = null
    if (resolved.redirect_whatsapp_after_submit && !isTest) {
      const digits =
        resolved.whatsapp_phone ||
        normalizePhoneDigits(String(hub.whatsapp_number || '')) ||
        ''
      if (digits) {
        const tpl =
          resolved.whatsapp_message ||
          `Olá! Acabei de enviar meus dados pelo site. Meu nome é ${name}.`
        whatsappUrl = `https://wa.me/${digits}?text=${encodeURIComponent(tpl)}`
      }
    }

    const successMessage = isTest
      ? `Lead de teste criado na etapa “${stage}”. Localize e exclua no CRM se desejar.`
      : resolved.success_message ||
        (result.duplicate
          ? 'Já tínhamos seu contato e atualizamos o atendimento.'
          : 'Recebemos seus dados.')

    logCapture('info', {
      request_id: requestId,
      step: 'done',
      slug,
      button_id: buttonId,
      result: result.created ? 'created' : 'updated',
      duplicate: result.duplicate,
    })

    return json(req, {
      ok: true,
      result: result.created ? 'created' : 'updated',
      created: result.created,
      duplicate: result.duplicate,
      message: successMessage,
      redirect_url: isTest ? null : resolved.redirect_url,
      whatsapp_url: whatsappUrl,
      stage: isTest ? stage : undefined,
      request_id: requestId,
    })
  } catch (err) {
    if (err instanceof HttpError) {
      logCapture('warn', {
        request_id: requestId,
        step,
        slug: slugForLog,
        button_id: buttonIdForLog,
        status: err.status,
        code: err.code || 'http_error',
      })
      return json(
        req,
        {
          ok: false,
          code: err.code || (err.status === 429 ? 'rate_limited' : 'server_error'),
          message: err.message,
          error: err.message,
          request_id: requestId,
        },
        err.status,
      )
    }
    logCapture('error', {
      request_id: requestId,
      step,
      slug: slugForLog,
      button_id: buttonIdForLog,
      code: 'unhandled',
      error: err instanceof Error ? err.message : 'unknown',
    })
    return json(
      req,
      {
        ok: false,
        code: 'server_error',
        message: 'Não foi possível enviar agora. Tente novamente.',
        error: 'Não foi possível enviar agora. Tente novamente.',
        request_id: requestId,
      },
      500,
    )
  }
})

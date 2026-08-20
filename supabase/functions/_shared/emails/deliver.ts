/**
 * Entrega de e-mail templated via Resend.
 * Usado por `send-email` (JWT) e `auth-email` (fluxos de autenticação).
 */
import { HttpError } from '../httpError.ts'
import { renderRegisteredTemplate } from './registry.ts'
import type { EmailBrandContext, EmailTemplateId, RenderedEmail } from './types.ts'

const RESEND_API_URL = 'https://api.resend.com/emails'

export function requireResendConfig(): { apiKey: string; from: string } {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim()
  const from = Deno.env.get('RESEND_FROM_EMAIL')?.trim()
  if (!apiKey) throw new HttpError(503, 'Envio de e-mail não configurado (RESEND_API_KEY)')
  if (!from) throw new HttpError(503, 'Envio de e-mail não configurado (RESEND_FROM_EMAIL)')
  return { apiKey, from }
}

export async function deliverTemplatedEmail(input: {
  template: EmailTemplateId
  to: string | string[]
  data: unknown
  brand?: EmailBrandContext
  locale?: string | null
  idempotencyKey?: string
}): Promise<{ id: string | null; rendered: RenderedEmail }> {
  const { apiKey, from } = requireResendConfig()
  const rendered = renderRegisteredTemplate(input.template, input.data, {
    locale: input.locale,
    brand: input.brand,
  })

  const to = Array.isArray(input.to) ? input.to : [input.to]
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  if (input.idempotencyKey) {
    headers['Idempotency-Key'] = input.idempotencyKey
  }

  const resendRes = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      from,
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    }),
  })

  const resendJson = await resendRes.json().catch(() => ({})) as {
    id?: string
    message?: string
    name?: string
  }

  if (!resendRes.ok) {
    console.error('[emails/deliver] falha Resend', {
      status: resendRes.status,
      name: resendJson.name,
      template: input.template,
    })
    const status = resendRes.status >= 400 && resendRes.status < 500 ? 400 : 502
    throw new HttpError(status, resendJson.message || 'Não foi possível enviar o e-mail')
  }

  return { id: resendJson.id ?? null, rendered }
}

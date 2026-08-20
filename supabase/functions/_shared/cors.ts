/**
 * CORS compartilhado da stack de Integrações / Meta OAuth.
 *
 * O supabase-js envia headers extras no preflight
 * (`x-supabase-client-platform`, etc.). Sem eles na allow-list o browser
 * bloqueia a chamada mesmo com APP_URL correto.
 */
import {
  META_SIGNATURE_HEADER,
  SHARED_SECRET_HEADER,
} from './webhookSignature.ts'

/** Headers que o supabase-js e a stack de integrações podem enviar. */
export const INTEGRATIONS_CORS_ALLOW_HEADERS = [
  'authorization',
  'apikey',
  'content-type',
  'x-client-info',
  'x-supabase-client-platform',
  'x-supabase-client-platform-version',
  'x-supabase-client-version',
  'x-supabase-api-version',
  SHARED_SECRET_HEADER,
  'x-healthcare-event-id',
  META_SIGNATURE_HEADER,
].join(', ')

export function corsHeaders(req: Request): Record<string, string> {
  const configuredOrigin = Deno.env.get('APP_URL')?.replace(/\/$/, '')
  const requestOrigin = req.headers.get('origin')?.replace(/\/$/, '')
  const allowedOrigin = configuredOrigin && requestOrigin === configuredOrigin
    ? requestOrigin
    : configuredOrigin || 'null'

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': INTEGRATIONS_CORS_ALLOW_HEADERS,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Vary': 'Origin',
  }
}

export function handleOptions(req: Request): Response | null {
  return req.method === 'OPTIONS'
    ? new Response(null, { status: 204, headers: corsHeaders(req) })
    : null
}

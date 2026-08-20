/**
 * Primitivas de autenticação de webhook.
 *
 * Sem dependências de propósito: roda no Deno (Edge Functions) e no Vitest.
 * Nenhuma função aqui lê o banco ou variáveis de ambiente.
 */

/** Esquemas de autenticação aceitos na entrada de webhook. */
export type WebhookAuthScheme = 'meta_hmac' | 'shared_secret';

/**
 * Provedores da Meta. Eles não permitem header customizado: a autenticação é
 * o HMAC do corpo em `X-Hub-Signature-256`, com o app secret da plataforma.
 */
export const META_WEBHOOK_PROVIDERS = [
  'meta',
  'facebook_lead_ads',
  'instagram_lead_ads',
  'whatsapp_business',
] as const;

export function webhookAuthScheme(provider: string): WebhookAuthScheme {
  return (META_WEBHOOK_PROVIDERS as readonly string[]).includes(provider)
    ? 'meta_hmac'
    : 'shared_secret';
}

/** Header do segredo compartilhado (provedores fora da Meta). */
export const SHARED_SECRET_HEADER = 'x-healthcare-secret';

/** Header de assinatura da Meta. */
export const META_SIGNATURE_HEADER = 'x-hub-signature-256';

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return toHex(digest);
}

export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return toHex(signature);
}

/**
 * Comparação em tempo constante entre dois hexadecimais.
 * Tamanhos diferentes já reprovam, sem vazar onde a diferença está.
 */
export function timingSafeEqualHex(left: string, right: string): boolean {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) {
    diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return diff === 0;
}

/** Extrai o hex de `sha256=<hex>`; devolve null em formato inesperado. */
export function parseMetaSignatureHeader(header: string | null): string | null {
  const match = header?.match(/^sha256=([a-f0-9]{64})$/i);
  return match ? match[1].toLowerCase() : null;
}

export interface WebhookChallenge {
  mode: string;
  verifyToken: string;
  challenge: string;
}

/**
 * Lê o desafio de verificação (`hub.mode=subscribe`) que a Meta envia por GET
 * ao cadastrar o endpoint. Devolve null quando não é um desafio.
 */
export function readWebhookChallenge(url: URL): WebhookChallenge | null {
  const mode = url.searchParams.get('hub.mode');
  if (!mode) return null;

  return {
    mode,
    verifyToken: url.searchParams.get('hub.verify_token') || '',
    challenge: url.searchParams.get('hub.challenge') || '',
  };
}

export interface WebhookAuthOutcome {
  valid: boolean;
  scheme: WebhookAuthScheme;
  /** Motivo curto para o log. Nunca contém o segredo recebido. */
  reason: string | null;
  /** Status a devolver quando inválido. */
  status: number;
}

export function authOk(scheme: WebhookAuthScheme): WebhookAuthOutcome {
  return { valid: true, scheme, reason: null, status: 200 };
}

export function authFail(
  scheme: WebhookAuthScheme,
  reason: string,
  status = 401,
): WebhookAuthOutcome {
  return { valid: false, scheme, reason, status };
}

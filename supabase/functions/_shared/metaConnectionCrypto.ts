/** Geração de segredo/slug e hash usados ao criar a casca da conexão Meta. */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

function toBase36(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join('')
}

export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(40)
  crypto.getRandomValues(bytes)
  return `whsec_${toBase36(bytes)}`
}

export async function hashSha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function randomNonce(bytes = 24): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return toBase36(buf)
}

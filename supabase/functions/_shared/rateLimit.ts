/**
 * Rate limit em memória por isolado Deno.
 *
 * Não é coordenação global entre réplicas: serve como primeira linha contra
 * abuso de token vazado ou martelada no slug do webhook. Limites rígidos
 * multi-instância ficam para retenção/job no banco (faixa de volume).
 */
import { HttpError } from './httpError.ts'

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** Limpa entradas expiradas de tempos em tempos para o Map não crescer sem fim. */
const CLEAN_EVERY = 200
let opsSinceClean = 0

function maybeClean(now: number): void {
  opsSinceClean += 1
  if (opsSinceClean < CLEAN_EVERY) return
  opsSinceClean = 0
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

/**
 * Incrementa o contador da chave. Estoura → 429.
 *
 * @param key identificador (ex.: `api:${tokenId}`, `wh:${integrationId}`)
 * @param limit máximo de requisições na janela
 * @param windowMs tamanho da janela em ms
 */
export function assertRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now()
  maybeClean(now)

  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }

  current.count += 1
  if (current.count > limit) {
    throw new HttpError(429, 'Muitas requisições. Tente novamente em instantes.')
  }
}

/** Só para testes. */
export function resetRateLimitBuckets(): void {
  buckets.clear()
  opsSinceClean = 0
}

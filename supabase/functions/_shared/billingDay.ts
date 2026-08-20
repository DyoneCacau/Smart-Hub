/** Dia de vencimento comercial (1–28), agenda da 1ª cobrança e pró-rata. */

export const DEFAULT_BILLING_DAY = 10

export type BillingDeferDays = 0 | 30 | 60

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function normalizeBillingDay(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_BILLING_DAY
  return Math.min(28, Math.max(1, Math.trunc(n)))
}

export function normalizeDeferDays(value: unknown): BillingDeferDays {
  const n = typeof value === 'number' ? value : Number(value)
  if (n === 30 || n === 60) return n
  return 0
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function nextBillingDate(billingDay: number, from: Date = new Date()): string {
  const day = normalizeBillingDay(billingDay)
  const today = startOfUtcDay(from)
  let candidate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day))
  if (candidate.getTime() <= today.getTime()) {
    candidate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, day))
  }
  return toIsoDate(candidate)
}

export function resolveFirstDueDate(
  billingDay: number,
  options: {
    deferDays?: number
    firstDueDate?: string | null
    from?: Date
  } = {},
): string {
  const from = options.from ?? new Date()
  if (isIsoDate(options.firstDueDate)) {
    const today = toIsoDate(startOfUtcDay(from))
    if (options.firstDueDate > today) return options.firstDueDate
  }
  const defer = normalizeDeferDays(options.deferDays ?? 0)
  if (defer === 0) return nextBillingDate(billingDay, from)
  const afterPromo = startOfUtcDay(from)
  afterPromo.setUTCDate(afterPromo.getUTCDate() + defer)
  return nextBillingDate(billingDay, afterPromo)
}

export function daysUntil(isoDate: string, from: Date = new Date()): number {
  const today = startOfUtcDay(from)
  const target = startOfUtcDay(new Date(`${isoDate.slice(0, 10)}T12:00:00.000Z`))
  const ms = target.getTime() - today.getTime()
  return Math.max(0, Math.round(ms / 86_400_000))
}

export function prorationAmount(monthlyFee: number, days: number): number {
  if (!Number.isFinite(monthlyFee) || monthlyFee <= 0 || days <= 0) return 0
  return Math.round(((monthlyFee * days) / 30) * 100) / 100
}

export function billingDayFromIsoDate(isoDate: string): number {
  const day = Number(isoDate.slice(8, 10))
  return normalizeBillingDay(Number.isFinite(day) ? day : DEFAULT_BILLING_DAY)
}

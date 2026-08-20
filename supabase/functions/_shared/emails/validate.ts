import { HttpError } from '../httpError.ts'
import type { EmailBrandContext } from './types.ts'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HTTPS_URL_RE = /^https:\/\/[^\s]+$/i

export function requireObject(value: unknown, field = 'data'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, `${field} inválido`)
  }
  return value as Record<string, unknown>
}

export function requireString(obj: Record<string, unknown>, key: string, max = 500): string {
  const value = obj[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `data.${key} é obrigatório`)
  }
  if (value.length > max) throw new HttpError(400, `data.${key} muito longo`)
  return value.trim()
}

export function optionalString(obj: Record<string, unknown>, key: string, max = 500): string | undefined {
  const value = obj[key]
  if (value == null) return undefined
  if (typeof value !== 'string') throw new HttpError(400, `data.${key} inválido`)
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.length > max) throw new HttpError(400, `data.${key} muito longo`)
  return trimmed
}

export function optionalNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const value = obj[key]
  if (value == null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpError(400, `data.${key} inválido`)
  }
  return value
}

export function requireHttpsUrl(obj: Record<string, unknown>, key: string): string {
  const value = requireString(obj, key, 2048)
  if (!HTTPS_URL_RE.test(value)) {
    throw new HttpError(400, `data.${key} deve ser uma URL https`)
  }
  return value
}

export function optionalHttpsUrl(obj: Record<string, unknown>, key: string): string | undefined {
  const value = optionalString(obj, key, 2048)
  if (!value) return undefined
  if (!HTTPS_URL_RE.test(value)) {
    throw new HttpError(400, `data.${key} deve ser uma URL https`)
  }
  return value
}

export function optionalEmail(obj: Record<string, unknown>, key: string): string | undefined {
  const value = optionalString(obj, key, 320)
  if (!value) return undefined
  if (!EMAIL_RE.test(value)) throw new HttpError(400, `data.${key} inválido`)
  return value.toLowerCase()
}

export function parseBrand(raw: unknown): EmailBrandContext | undefined {
  if (raw == null) return undefined
  const obj = requireObject(raw, 'brand')
  const brand: EmailBrandContext = {}
  const appName = optionalString(obj, 'appName', 120)
  const clinicName = optionalString(obj, 'clinicName', 200)
  const supportEmail = optionalEmail(obj, 'supportEmail')
  const primaryColor = optionalString(obj, 'primaryColor', 16)
  const logoUrl = optionalHttpsUrl(obj, 'logoUrl')
  if (appName) brand.appName = appName
  if (clinicName) brand.clinicName = clinicName
  if (supportEmail) brand.supportEmail = supportEmail
  if (primaryColor) brand.primaryColor = primaryColor
  if (logoUrl) brand.logoUrl = logoUrl
  return brand
}

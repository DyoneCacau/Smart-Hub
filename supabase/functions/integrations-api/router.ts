/**
 * Router mínimo da API REST de integrações.
 *
 * Mantém as rotas declarativas para que cada integração futura registre
 * seu controller sem mexer no `index.ts`.
 */
import { HttpError } from '../_shared/integrations.ts'

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface RouteContext {
  req: Request
  /** Segmentos após /integrations-api (ex.: ['integrations', '<id>']) */
  segments: string[]
  searchParams: URLSearchParams
  /** Tenant resolvido pelo token — nunca vem da requisição */
  clinicId: string
  /** Corpo já parseado em POST/PATCH */
  payload: unknown
}

export interface RouteHandlerResult {
  status?: number
  body: unknown
}

export type RouteHandler = (ctx: RouteContext) => Promise<RouteHandlerResult>

export interface Route {
  method: HttpMethod
  /** Padrão por segmentos; `:param` casa com qualquer valor */
  pattern: string
  /** Escopo exigido no token do tenant */
  scope: string
  handler: RouteHandler
  description: string
}

function matches(pattern: string, segments: string[]): boolean {
  const parts = pattern.split('/').filter(Boolean)
  if (parts.length !== segments.length) return false
  return parts.every((part, index) => part.startsWith(':') || part === segments[index])
}

export function resolveRoute(routes: Route[], method: string, segments: string[]): Route {
  const candidates = routes.filter((route) => matches(route.pattern, segments))
  if (candidates.length === 0) throw new HttpError(404, 'Rota não encontrada')

  const route = candidates.find((r) => r.method === method)
  if (!route) throw new HttpError(405, 'Método não permitido para esta rota')

  return route
}

/** Documentação das rotas — usada em GET / da própria API. */
export function describeRoutes(routes: Route[]): Array<Record<string, string>> {
  return routes.map((route) => ({
    method: route.method,
    path: `/${route.pattern}`,
    scope: route.scope,
    description: route.description,
  }))
}

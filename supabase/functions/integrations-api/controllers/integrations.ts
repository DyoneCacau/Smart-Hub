/**
 * Controller REST de integrações do tenant.
 *
 * Escopo do módulo: leitura dos metadados da conexão. Segredo, hash e
 * credentials_ref nunca são expostos pela API.
 */
import { HttpError, serviceClient } from '../../_shared/integrations.ts'
import type { RouteHandlerResult } from '../router.ts'

const PUBLIC_COLUMNS =
  'id, provider, category, name, description, status, direction, config, external_account_id, last_event_at, is_active, created_at, updated_at'

export async function listIntegrations(
  clinicId: string,
  searchParams: URLSearchParams,
): Promise<RouteHandlerResult> {
  const supabase = serviceClient()
  let request = supabase
    .from('integrations')
    .select(PUBLIC_COLUMNS)
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })

  const provider = searchParams.get('provider')
  const status = searchParams.get('status')
  if (provider) request = request.eq('provider', provider)
  if (status) request = request.eq('status', status)

  const { data, error } = await request
  if (error) throw new HttpError(500, 'Falha ao listar integrações')

  return { body: { data: data ?? [] } }
}

export async function getIntegration(
  clinicId: string,
  integrationId: string,
): Promise<RouteHandlerResult> {
  const supabase = serviceClient()
  const { data, error } = await supabase
    .from('integrations')
    .select(PUBLIC_COLUMNS)
    .eq('clinic_id', clinicId)
    .eq('id', integrationId)
    .maybeSingle()

  if (error) throw new HttpError(500, 'Falha ao carregar integração')
  if (!data) throw new HttpError(404, 'Integração não encontrada')

  return { body: { data } }
}

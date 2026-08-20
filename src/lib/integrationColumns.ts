/**
 * Colunas de `integrations` legíveis pelo app.
 *
 * `webhook_secret_hash` e `credentials_ref` ficam de fora de propósito: são
 * credenciais e não devem chegar ao navegador. O `PRODUCAO_27` revoga o acesso
 * a elas também no banco, e há teste garantindo que as duas listas não
 * divergem (`src/test/integrationsGrants.test.ts`).
 *
 * Módulo sem dependências para poder ser lido em teste sem subir o client.
 */
export const INTEGRATION_READABLE_COLUMNS = [
  'id',
  'clinic_id',
  'provider',
  'category',
  'name',
  'description',
  'status',
  'direction',
  'config',
  'external_account_id',
  'webhook_slug',
  'last_event_at',
  'last_error',
  'is_active',
  'created_at',
  'updated_at',
] as const;

/** Lista pronta para o `.select()` do PostgREST. */
export const INTEGRATION_SELECT = INTEGRATION_READABLE_COLUMNS.join(', ');

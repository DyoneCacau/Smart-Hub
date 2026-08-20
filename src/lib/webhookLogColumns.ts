/**
 * Colunas de `webhook_logs` legíveis pelo app.
 *
 * `payload`, `headers` e `response` ficam de fora: podem conter PII do lead
 * (nome, telefone, e-mail, CPF). O replay usa service_role nas Edge Functions.
 * O `PRODUCAO_28` revoga o SELECT dessas colunas também no banco.
 */
export const WEBHOOK_LOG_READABLE_COLUMNS = [
  'id',
  'clinic_id',
  'integration_id',
  'direction',
  'provider',
  'event_type',
  'http_method',
  'endpoint',
  'status',
  'status_code',
  'signature_valid',
  'external_event_id',
  'error_message',
  'processed_at',
  'created_at',
] as const;

/** Lista pronta para o `.select()` do PostgREST. */
export const WEBHOOK_LOG_SELECT = WEBHOOK_LOG_READABLE_COLUMNS.join(', ');

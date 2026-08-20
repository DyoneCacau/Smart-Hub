/**
 * Normalizador universal de payload de lead.
 *
 * Cada integração manda o lead num formato diferente: Facebook/Instagram Lead
 * Ads usam `field_data`, landing pages mandam JSON plano em português,
 * n8n/Make/Zapier repassam o corpo que receberam. Este arquivo traduz todos
 * eles para o formato do `crm_leads`.
 *
 * Sem dependências de propósito: roda no Deno (Edge Functions) e no Vitest.
 */

export const LEAD_SOURCE_VALUES = [
  'instagram',
  'whatsapp',
  'facebook',
  'referral',
  'paid_traffic',
  'other',
  'smart_hub',
] as const;

export type LeadSourceValue = (typeof LEAD_SOURCE_VALUES)[number];

export type LeadStageValue = 'new' | 'contact' | 'scheduled' | 'won' | 'lost';

/** Aceita só o enum do CHECK do banco — sem fuzzy match. */
export function isLeadSourceValue(value: string): value is LeadSourceValue {
  return (LEAD_SOURCE_VALUES as readonly string[]).includes(value);
}

export const LEAD_DEDUPE_MODES = ['auto', 'external_id', 'none'] as const;

export type LeadDedupeMode = (typeof LEAD_DEDUPE_MODES)[number];

export function isLeadDedupeMode(value: string): value is LeadDedupeMode {
  return (LEAD_DEDUPE_MODES as readonly string[]).includes(value);
}

export interface NormalizedLead {
  name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  leadSource: LeadSourceValue | null;
  referralName: string | null;
  interest: string | null;
  estimatedValue: number | null;
  notes: string | null;
  stage: LeadStageValue;
  /** Id do lead no provedor — base da idempotência */
  externalLeadId: string | null;
  /**
   * Últimos 10 dígitos do telefone. Compara com `crm_leads.phone_dedupe_key`,
   * então reconhece o mesmo número com ou sem código do país e formatação.
   */
  phoneDedupeKey: string | null;
  /** E-mail normalizado; compara com `crm_leads.email_dedupe_key`. */
  emailDedupeKey: string | null;
  /** Ajustes feitos na normalização (ex.: nome derivado do telefone) */
  warnings: string[];
}

export interface NormalizeLeadOptions {
  /** Provedor da integração; define a origem quando o payload não informa */
  provider?: string | null;
  /** Origem padrão explícita, tem prioridade sobre a do provedor */
  defaultLeadSource?: LeadSourceValue | null;
}

/**
 * Provedores externos cujo webhook de integração cria lead no CRM por padrão.
 *
 * Não inclui fontes internas (ex.: Smart Hub via `smart-hub-capture`) — ver
 * `INTERNAL_LEAD_SOURCES`. `whatsapp_business` fica fora de propósito: cada
 * mensagem recebida viraria um card no Kanban. `external_api` é de saída.
 * Ambos podem ativar a captação marcando `config.lead_capture = true`.
 *
 * Fonte única da verdade para integrações de webhook: o registro de handlers
 * (Edge Functions) e o catálogo do app (`createsLeads`) derivam desta lista.
 */
export const LEAD_CAPTURE_PROVIDERS = [
  'meta',
  'facebook_lead_ads',
  'instagram_lead_ads',
  'landing_page',
  'webhook',
  'n8n',
  'make',
  'zapier',
] as const;

export type LeadCaptureProvider = (typeof LEAD_CAPTURE_PROVIDERS)[number];

/**
 * Fontes internas de captura de lead (produto próprio, sem integração/webhook
 * configurável pelo cliente). Continuam válidas em `LEAD_SOURCE_VALUES` /
 * `crm_leads.source` e no `ingestLead` (ex.: Edge Function `smart-hub-capture`).
 */
export const INTERNAL_LEAD_SOURCES = ['smart_hub'] as const;

export type InternalLeadSource = (typeof INTERNAL_LEAD_SOURCES)[number];

export function isInternalLeadSource(value: string): value is InternalLeadSource {
  return (INTERNAL_LEAD_SOURCES as readonly string[]).includes(value);
}

export function providerCreatesLeads(provider: string): boolean {
  return (LEAD_CAPTURE_PROVIDERS as readonly string[]).includes(provider);
}

/** Origem padrão por provedor quando o payload não traz `source`. */
export const PROVIDER_DEFAULT_LEAD_SOURCE: Record<string, LeadSourceValue> = {
  meta: 'paid_traffic',
  facebook_lead_ads: 'facebook',
  instagram_lead_ads: 'instagram',
  whatsapp_business: 'whatsapp',
  landing_page: 'other',
  webhook: 'other',
  external_api: 'other',
  n8n: 'other',
  make: 'other',
  zapier: 'other',
  smart_hub: 'smart_hub',
};

const NAME_KEYS = [
  'name',
  'full_name',
  'fullname',
  'nome',
  'nome_completo',
  'nomecompleto',
  'lead_name',
  'contact_name',
  'cliente',
  'contato',
  'paciente',
];
const FIRST_NAME_KEYS = ['first_name', 'firstname', 'primeiro_nome', 'nome_1'];
const LAST_NAME_KEYS = ['last_name', 'lastname', 'sobrenome', 'ultimo_nome'];
const PHONE_KEYS = [
  'phone',
  'phone_number',
  'phonenumber',
  'telephone',
  'telefone',
  'celular',
  'whatsapp',
  'whatsapp_number',
  'mobile',
  'mobile_phone',
  'fone',
  'tel',
  'contato_telefone',
];
const EMAIL_KEYS = ['email', 'e_mail', 'e-mail', 'mail', 'email_address', 'correio'];
const CPF_KEYS = ['cpf', 'documento', 'document', 'tax_id', 'cpf_cnpj'];
const INTEREST_KEYS = [
  'interest',
  'interesse',
  'procedimento',
  'procedure',
  'servico',
  'serviço',
  'service',
  'tratamento',
  'assunto',
  'subject',
  'campanha',
  'campaign_name',
];
const NOTES_KEYS = [
  'notes',
  'note',
  'observacao',
  'observação',
  'observacoes',
  'observações',
  'obs',
  'comentario',
  'comentário',
  'comments',
  'message',
  'mensagem',
  'descricao',
  'descrição',
];
const SOURCE_KEYS = [
  'source',
  'lead_source',
  'leadsource',
  'origem',
  'canal',
  'channel',
  'utm_source',
  'plataforma',
  'platform',
];
const REFERRAL_KEYS = [
  'referral',
  'referral_name',
  'indicacao',
  'indicação',
  'indicado_por',
  'quem_indicou',
  'referred_by',
];
const VALUE_KEYS = [
  'estimated_value',
  'valor',
  'valor_estimado',
  'value',
  'ticket',
  'orcamento',
  'orçamento',
  'budget',
];
const EXTERNAL_ID_KEYS = [
  'external_lead_id',
  'lead_id',
  'leadgen_id',
  'leadid',
  'external_id',
  'form_entry_id',
  'submission_id',
  'id',
];
const STAGE_KEYS = ['stage', 'etapa', 'status', 'pipeline_stage'];

const VALID_STAGES: LeadStageValue[] = ['new', 'contact', 'scheduled', 'won', 'lost'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Chave comparável: minúsculas, sem acento, sem separador. */
function normalizeKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s\-_.]/g, '');
}

const KEY_ALIASES: Record<string, string[]> = {};
function aliasSet(keys: string[]): string[] {
  const cacheKey = keys.join('|');
  if (!KEY_ALIASES[cacheKey]) {
    KEY_ALIASES[cacheKey] = keys.map(normalizeKey);
  }
  return KEY_ALIASES[cacheKey];
}

/**
 * Descasca envelopes comuns (`data`, `body`, `lead`, `payload`) e o formato
 * de webhook do Facebook/Instagram, até chegar no objeto do lead.
 */
export function unwrapLeadPayload(payload: unknown): Record<string, unknown> {
  let current: unknown = payload;

  for (let depth = 0; depth < 6; depth++) {
    if (Array.isArray(current)) {
      current = current[0];
      continue;
    }
    if (!isRecord(current)) break;

    // Webhook Meta: entry[].changes[].value
    const entry = current.entry;
    if (Array.isArray(entry) && entry.length > 0) {
      const firstEntry = entry[0];
      if (isRecord(firstEntry) && Array.isArray(firstEntry.changes)) {
        const change = firstEntry.changes[0];
        if (isRecord(change) && isRecord(change.value)) {
          current = change.value;
          continue;
        }
      }
    }

    const wrapperKey = ['lead', 'data', 'body', 'payload', 'result', 'form_response'].find(
      (key) => isRecord(current as Record<string, unknown>) && isRecord((current as Record<string, unknown>)[key]),
    );
    if (wrapperKey) {
      current = (current as Record<string, unknown>)[wrapperKey];
      continue;
    }

    const listKey = ['leads', 'items', 'records'].find(
      (key) => Array.isArray((current as Record<string, unknown>)[key]),
    );
    if (listKey) {
      const list = (current as Record<string, unknown>)[listKey] as unknown[];
      if (list.length > 0 && isRecord(list[0])) {
        current = list[0];
        continue;
      }
    }

    break;
  }

  return isRecord(current) ? current : {};
}

function stringifyValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const first = value.find((item) => item != null);
    return first == null ? null : stringifyValue(first);
  }
  return null;
}

/**
 * Achata o payload em pares chave→valor, cobrindo objetos planos e as listas
 * de campos usadas por formulários (`field_data`, `fields`, `answers`).
 */
export function collectLeadFields(payload: Record<string, unknown>): Record<string, string> {
  const fields: Record<string, string> = {};

  const put = (rawKey: unknown, rawValue: unknown) => {
    const key = typeof rawKey === 'string' ? normalizeKey(rawKey) : '';
    if (!key) return;
    const value = stringifyValue(rawValue);
    if (value == null) return;
    // Primeira ocorrência ganha: envelopes externos são menos específicos
    if (!(key in fields)) fields[key] = value;
  };

  const walkList = (list: unknown[]) => {
    for (const item of list) {
      if (!isRecord(item)) continue;
      const name = item.name ?? item.key ?? item.label ?? item.field ?? item.question;
      const value = item.values ?? item.value ?? item.answer ?? item.text;
      put(name, value);
    }
  };

  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      const looksLikeFieldList = value.some(
        (item) => isRecord(item) && ('name' in item || 'key' in item || 'label' in item),
      );
      if (looksLikeFieldList) {
        walkList(value);
        continue;
      }
    }
    if (isRecord(value)) {
      // Um nível de aninhamento: { contact: { phone } }, { utm: { source } }
      for (const [innerKey, innerValue] of Object.entries(value)) {
        put(innerKey, innerValue);
      }
      continue;
    }
    put(key, value);
  }

  return fields;
}

function pick(fields: Record<string, string>, keys: string[]): string | null {
  for (const alias of aliasSet(keys)) {
    const value = fields[alias];
    if (value) return value;
  }
  return null;
}

/** Mantém só dígitos; descarta números curtos demais para serem telefone. */
export function normalizeLeadPhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) return null;
  // Remove o 55 do país quando o número já tem DDD + 8/9 dígitos
  if (digits.length > 11 && digits.startsWith('55')) {
    const withoutCountry = digits.slice(2);
    if (withoutCountry.length === 10 || withoutCountry.length === 11) return withoutCountry;
  }
  return digits;
}

/** Chave de comparação do telefone: os 10 últimos dígitos. */
export function leadPhoneDedupeKey(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(-10) : null;
}

export function normalizeLeadEmail(raw: string | null): string | null {
  if (!raw) return null;
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

export function normalizeLeadCpf(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}

/** Aceita "R$ 1.500,00", "1500.50" e "1500". */
export function parseLeadValue(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,.-]/g, '');
  if (!cleaned) return null;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;

  if (hasComma && hasDot) {
    // Formato pt-BR: ponto é milhar, vírgula é decimal
    normalized = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.');
  }

  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Traduz o texto de origem para o enum do CRM. */
export function resolveLeadSource(raw: string | null): LeadSourceValue | null {
  if (!raw) return null;
  const value = normalizeKey(raw);
  if (!value) return null;

  if (['instagram', 'ig', 'insta'].includes(value)) return 'instagram';
  if (['facebook', 'fb', 'meta', 'facebookleadads', 'fbads'].includes(value)) return 'facebook';
  if (['whatsapp', 'wpp', 'zap', 'whats', 'wa'].includes(value)) return 'whatsapp';
  if (['referral', 'indicacao', 'indicado', 'indicacaoamigo', 'boca a boca'].includes(value)) {
    return 'referral';
  }
  if (
    [
      'paidtraffic',
      'trafegopago',
      'ads',
      'googleads',
      'google',
      'adwords',
      'cpc',
      'paid',
      'anuncio',
    ].includes(value)
  ) {
    return 'paid_traffic';
  }
  if (value.includes('instagram')) return 'instagram';
  if (value.includes('facebook')) return 'facebook';
  if (value.includes('whatsapp')) return 'whatsapp';
  if (value.includes('indica') || value.includes('referral')) return 'referral';
  if (value.includes('trafego') || value.includes('ads') || value.includes('paid')) {
    return 'paid_traffic';
  }
  return 'other';
}

function resolveStage(raw: string | null): LeadStageValue {
  if (!raw) return 'new';
  const value = normalizeKey(raw);
  const direct = VALID_STAGES.find((stage) => stage === value);
  if (direct) return direct;
  if (['novo', 'new', 'aberto'].includes(value)) return 'new';
  if (['contato', 'emcontato', 'contact', 'followup'].includes(value)) return 'contact';
  if (['agendado', 'scheduled', 'marcado'].includes(value)) return 'scheduled';
  if (['fechado', 'won', 'ganho', 'convertido'].includes(value)) return 'won';
  if (['perdido', 'lost'].includes(value)) return 'lost';
  return 'new';
}

function composeName(fields: Record<string, string>): string | null {
  const direct = pick(fields, NAME_KEYS);
  if (direct) return direct;

  const first = pick(fields, FIRST_NAME_KEYS);
  const last = pick(fields, LAST_NAME_KEYS);
  const composed = [first, last].filter(Boolean).join(' ').trim();
  return composed || null;
}

/**
 * Converte qualquer payload em um lead pronto para o CRM.
 *
 * Lead sem nome não é descartado: a clínica não pode perder contato. O nome
 * passa a ser o telefone ou e-mail e o ajuste fica em `warnings` e nas
 * observações do lead.
 */
export function normalizeLeadPayload(
  payload: unknown,
  options: NormalizeLeadOptions = {},
): NormalizedLead {
  const unwrapped = unwrapLeadPayload(payload);
  const fields = collectLeadFields(unwrapped);
  const warnings: string[] = [];

  const phone = normalizeLeadPhone(pick(fields, PHONE_KEYS));
  const email = normalizeLeadEmail(pick(fields, EMAIL_KEYS));

  let name = composeName(fields);
  if (!name) {
    name = phone || email || null;
    if (name) {
      warnings.push('Lead sem nome: usamos o contato como identificação.');
    }
  }
  if (!name) {
    name = 'Lead sem identificação';
    warnings.push('Lead sem nome, telefone ou e-mail no payload recebido.');
  }

  const providerDefault = options.provider
    ? PROVIDER_DEFAULT_LEAD_SOURCE[options.provider] ?? null
    : null;
  const leadSource =
    resolveLeadSource(pick(fields, SOURCE_KEYS)) ||
    options.defaultLeadSource ||
    providerDefault;

  const notesFromPayload = pick(fields, NOTES_KEYS);
  const notes = [notesFromPayload, ...warnings].filter(Boolean).join(' ').trim() || null;

  return {
    name: name.slice(0, 200),
    phone,
    email,
    cpf: normalizeLeadCpf(pick(fields, CPF_KEYS)),
    leadSource,
    referralName: pick(fields, REFERRAL_KEYS),
    interest: pick(fields, INTEREST_KEYS),
    estimatedValue: parseLeadValue(pick(fields, VALUE_KEYS)),
    notes,
    stage: resolveStage(pick(fields, STAGE_KEYS)),
    externalLeadId: pick(fields, EXTERNAL_ID_KEYS),
    phoneDedupeKey: leadPhoneDedupeKey(phone),
    emailDedupeKey: email,
    warnings,
  };
}

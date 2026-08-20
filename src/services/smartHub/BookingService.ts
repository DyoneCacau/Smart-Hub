import { supabase } from '@/integrations/supabase/client';

export const BOOKING_INITIAL_WINDOW_DAYS = 14;
export const BOOKING_MAX_WINDOW_DAYS = 30;

export const BOOKING_PUBLIC_ERROR_MESSAGES: Record<string, string> = {
  booking_disabled: 'O agendamento online não está disponível no momento.',
  invalid_date_range: 'O período selecionado é inválido. Escolha outra data.',
  procedure_not_found: 'Este procedimento não está mais disponível.',
  professional_not_found: 'Este profissional não está mais disponível.',
  professional_not_eligible:
    'Este profissional não realiza o procedimento selecionado. Escolha outro.',
  slot_taken: 'Este horário acabou de ser reservado. Escolha outro horário.',
  idempotency_conflict: 'Esta solicitação conflita com um agendamento já iniciado. Tente novamente.',
  rate_limited: 'Muitas tentativas. Aguarde um momento e tente de novo.',
  internal_error: 'Não foi possível concluir o agendamento. Tente novamente.',
  invalid_payload: 'Verifique os dados informados e tente novamente.',
  privacy_required: 'É necessário aceitar a política de privacidade.',
  outside_work_schedule: 'Horário fora da jornada do profissional.',
  network_error: 'Falha de conexão. Verifique a internet e tente novamente.',
  server_error: 'Não foi possível concluir o agendamento. Tente novamente.',
  catalog_empty: 'Nenhum procedimento ou profissional disponível para agendamento.',
  hub_not_found: 'Hub não encontrado.',
};

export interface BookingSlot {
  date: string;
  start_time: string;
  end_time: string;
}

export interface BookingCatalogProfessional {
  id: string;
  name: string;
}

export interface BookingCatalogProcedure {
  id: string;
  name: string;
  duration_minutes: number;
  professionals: BookingCatalogProfessional[];
}

export interface BookingCatalogResult {
  ok: boolean;
  booking_enabled?: boolean;
  procedures?: BookingCatalogProcedure[];
  /** @deprecated Preferir procedure.professionals no contrato atual. */
  professionals?: BookingCatalogProfessional[];
  code?: string;
  error?: string;
  request_id?: string;
  status?: number;
}

export interface BookingAvailabilityResult {
  ok: boolean;
  booking_enabled?: boolean;
  procedure?: { id: string; name: string; duration_minutes: number };
  professional?: { id: string; name: string };
  timezone?: string;
  slots?: BookingSlot[];
  code?: string;
  error?: string;
  request_id?: string;
  status?: number;
}

export interface BookingConfirmInput {
  slug: string;
  procedure_id: string;
  professional_id: string;
  date: string;
  start_time: string;
  idempotency_key: string;
  privacy_accepted: boolean;
  notes?: string;
  patient: {
    name: string;
    phone: string;
    email?: string;
  };
}

export interface BookingConfirmResult {
  ok: boolean;
  success?: boolean;
  appointment_id?: string;
  status?: string;
  patient_id?: string;
  lead_id?: string;
  duplicate_patient?: boolean;
  duplicate_lead?: boolean;
  slot?: BookingSlot & { professional_id?: string };
  code?: string;
  error?: string;
  request_id?: string;
  http_status?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function mapPublicMessage(code?: string, fallback?: string): string {
  if (code && BOOKING_PUBLIC_ERROR_MESSAGES[code]) {
    return BOOKING_PUBLIC_ERROR_MESSAGES[code];
  }
  return fallback || BOOKING_PUBLIC_ERROR_MESSAGES.server_error;
}

async function parseFunctionError(error: unknown): Promise<{
  message: string;
  code?: string;
  request_id?: string;
  status?: number;
}> {
  if (isRecord(error) && error.context instanceof Response) {
    const status = error.context.status;
    const payload: unknown = await error.context.clone().json().catch(() => null);
    if (isRecord(payload)) {
      const code = typeof payload.code === 'string' ? payload.code : undefined;
      const message =
        (typeof payload.message === 'string' && payload.message) ||
        (typeof payload.error === 'string' && payload.error) ||
        undefined;
      const request_id =
        typeof payload.request_id === 'string' ? payload.request_id : undefined;
      return {
        message: mapPublicMessage(code, message),
        code,
        request_id,
        status,
      };
    }
    if (status === 429) {
      return {
        message: BOOKING_PUBLIC_ERROR_MESSAGES.rate_limited,
        code: 'rate_limited',
        status,
      };
    }
  }
  if (error instanceof TypeError) {
    return { message: BOOKING_PUBLIC_ERROR_MESSAGES.network_error, code: 'network_error' };
  }
  return { message: BOOKING_PUBLIC_ERROR_MESSAGES.server_error, code: 'server_error' };
}

function parseErrorPayload(
  data: unknown,
  parsed: { message: string; code?: string; request_id?: string; status?: number }
) {
  const fromData = isRecord(data) ? data : null;
  return {
    ok: false as const,
    code:
      parsed.code ||
      (fromData && typeof fromData.code === 'string' ? fromData.code : undefined),
    error: parsed.message,
    request_id:
      parsed.request_id ||
      (fromData && typeof fromData.request_id === 'string' ? fromData.request_id : undefined),
    status: parsed.status,
  };
}

/** Datas YYYY-MM-DD em UTC calendar (janela de availability). */
export function addDaysYmd(fromYmd: string, days: number): string {
  const [y, m, d] = fromYmd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function todayYmdLocal(): string {
  const now = new Date();
  const yy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function formatBookingDateLabel(dateYmd: string): string {
  const [y, m, d] = dateYmd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

export function formatBookingTimeRange(start: string, end: string): string {
  return `${start} – ${end}`;
}

export function digitsOnlyPhone(value: string): string {
  return (value || '').replace(/\D/g, '');
}

/** Máscara visual BR; servidor continua sendo a fonte da verdade. */
export function formatPhoneMaskBr(value: string): string {
  const digits = digitsOnlyPhone(value).slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function isPhoneVisuallyValid(value: string): boolean {
  const digits = digitsOnlyPhone(value);
  return digits.length >= 10 && digits.length <= 13;
}

export function groupSlotsByDate(slots: BookingSlot[]): { date: string; slots: BookingSlot[] }[] {
  const map = new Map<string, BookingSlot[]>();
  for (const slot of slots) {
    const list = map.get(slot.date) || [];
    list.push(slot);
    map.set(slot.date, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, daySlots]) => ({
      date,
      slots: daySlots.sort((x, y) => x.start_time.localeCompare(y.start_time)),
    }));
}

export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `booking-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Garante que o payload de confirm não inclui campos proibidos. */
export function buildConfirmPayload(input: BookingConfirmInput): Record<string, unknown> {
  return {
    action: 'confirm',
    slug: input.slug,
    procedure_id: input.procedure_id,
    professional_id: input.professional_id,
    date: input.date,
    start_time: input.start_time,
    idempotency_key: input.idempotency_key,
    privacy_accepted: input.privacy_accepted === true,
    notes: input.notes?.trim() || undefined,
    patient: {
      name: input.patient.name.trim(),
      phone: digitsOnlyPhone(input.patient.phone) || input.patient.phone.trim(),
      email: input.patient.email?.trim() || undefined,
    },
  };
}

function normalizeCatalogProcedures(raw: unknown): BookingCatalogProcedure[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!isRecord(item)) return null;
      const id = typeof item.id === 'string' ? item.id : '';
      const name = typeof item.name === 'string' ? item.name : '';
      const duration = Number(item.duration_minutes);
      if (!id || !name) return null;
      const professionals = Array.isArray(item.professionals)
        ? item.professionals
            .filter(isRecord)
            .map((p) => ({
              id: typeof p.id === 'string' ? p.id : '',
              name: typeof p.name === 'string' ? p.name : '',
            }))
            .filter((p) => p.id && p.name)
        : [];
      return {
        id,
        name,
        duration_minutes: Number.isFinite(duration) ? duration : 30,
        professionals,
      };
    })
    .filter((p): p is BookingCatalogProcedure => p !== null);
}

export const BookingService = {
  async getCatalog(slug: string): Promise<BookingCatalogResult> {
    try {
      const { data, error } = await supabase.functions.invoke('smart-hub-booking', {
        body: { action: 'catalog', slug },
      });

      if (error) {
        return parseErrorPayload(data, await parseFunctionError(error));
      }

      const payload = (data || {}) as Record<string, unknown>;
      if (payload.ok === false || payload.success === false) {
        const code = typeof payload.code === 'string' ? payload.code : undefined;
        return {
          ok: false,
          code,
          error: mapPublicMessage(
            code,
            typeof payload.message === 'string' ? payload.message : undefined
          ),
          request_id:
            typeof payload.request_id === 'string' ? payload.request_id : undefined,
        };
      }

      const procedures = normalizeCatalogProcedures(payload.procedures);

      return {
        ok: true,
        booking_enabled: payload.booking_enabled !== false,
        procedures,
        request_id:
          typeof payload.request_id === 'string' ? payload.request_id : undefined,
      };
    } catch (err) {
      if (err instanceof TypeError) {
        return {
          ok: false,
          code: 'network_error',
          error: BOOKING_PUBLIC_ERROR_MESSAGES.network_error,
        };
      }
      return {
        ok: false,
        code: 'server_error',
        error: BOOKING_PUBLIC_ERROR_MESSAGES.server_error,
      };
    }
  },

  async getAvailability(input: {
    slug: string;
    procedure_id: string;
    professional_id: string;
    from_date: string;
    to_date: string;
  }): Promise<BookingAvailabilityResult> {
    try {
      const { data, error } = await supabase.functions.invoke('smart-hub-booking', {
        body: {
          action: 'availability',
          slug: input.slug,
          procedure_id: input.procedure_id,
          professional_id: input.professional_id,
          from_date: input.from_date,
          to_date: input.to_date,
        },
      });

      if (error) {
        return parseErrorPayload(data, await parseFunctionError(error));
      }

      const payload = (data || {}) as Record<string, unknown>;
      if (payload.ok === false || payload.success === false) {
        const code = typeof payload.code === 'string' ? payload.code : undefined;
        return {
          ok: false,
          code,
          error: mapPublicMessage(
            code,
            typeof payload.message === 'string' ? payload.message : undefined
          ),
          request_id:
            typeof payload.request_id === 'string' ? payload.request_id : undefined,
        };
      }

      return {
        ok: true,
        booking_enabled: payload.booking_enabled !== false,
        procedure: payload.procedure as BookingAvailabilityResult['procedure'],
        professional: payload.professional as BookingAvailabilityResult['professional'],
        timezone: typeof payload.timezone === 'string' ? payload.timezone : undefined,
        slots: Array.isArray(payload.slots) ? (payload.slots as BookingSlot[]) : [],
        request_id:
          typeof payload.request_id === 'string' ? payload.request_id : undefined,
      };
    } catch (err) {
      if (err instanceof TypeError) {
        return {
          ok: false,
          code: 'network_error',
          error: BOOKING_PUBLIC_ERROR_MESSAGES.network_error,
        };
      }
      return {
        ok: false,
        code: 'server_error',
        error: BOOKING_PUBLIC_ERROR_MESSAGES.server_error,
      };
    }
  },

  async confirm(input: BookingConfirmInput): Promise<BookingConfirmResult> {
    try {
      const body = buildConfirmPayload(input);
      const { data, error } = await supabase.functions.invoke('smart-hub-booking', {
        body,
      });

      if (error) {
        const parsed = await parseFunctionError(error);
        const fromData = isRecord(data) ? data : null;
        return {
          ok: false,
          code:
            parsed.code ||
            (fromData && typeof fromData.code === 'string' ? fromData.code : undefined),
          error: parsed.message,
          request_id:
            parsed.request_id ||
            (fromData && typeof fromData.request_id === 'string'
              ? fromData.request_id
              : undefined),
          http_status: parsed.status,
        };
      }

      const payload = (data || {}) as Record<string, unknown>;
      if (payload.ok === false || payload.success === false) {
        const code = typeof payload.code === 'string' ? payload.code : undefined;
        return {
          ok: false,
          code,
          error: mapPublicMessage(
            code,
            typeof payload.message === 'string' ? payload.message : undefined
          ),
          request_id:
            typeof payload.request_id === 'string' ? payload.request_id : undefined,
        };
      }

      return {
        ok: true,
        success: true,
        appointment_id:
          typeof payload.appointment_id === 'string' ? payload.appointment_id : undefined,
        status: typeof payload.status === 'string' ? payload.status : 'confirmed',
        patient_id: typeof payload.patient_id === 'string' ? payload.patient_id : undefined,
        lead_id: typeof payload.lead_id === 'string' ? payload.lead_id : undefined,
        duplicate_patient: payload.duplicate_patient === true,
        duplicate_lead: payload.duplicate_lead === true,
        slot: payload.slot as BookingConfirmResult['slot'],
        request_id:
          typeof payload.request_id === 'string' ? payload.request_id : undefined,
        http_status: payload.duplicate_patient === true || payload.duplicate_lead === true ? 200 : 201,
      };
    } catch (err) {
      if (err instanceof TypeError) {
        return {
          ok: false,
          code: 'network_error',
          error: BOOKING_PUBLIC_ERROR_MESSAGES.network_error,
        };
      }
      return {
        ok: false,
        code: 'server_error',
        error: BOOKING_PUBLIC_ERROR_MESSAGES.server_error,
      };
    }
  },
};

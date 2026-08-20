/**
 * Cálculo puro de slots do agendamento online (Smart Hub Fase B).
 * Sem dependências Deno — testável no Vitest.
 */

export const BOOKING_TIMEZONE = 'America/Fortaleza';
export const MAX_AVAILABILITY_DAYS = 30;
export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 720;

export type BookingWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface WorkPeriod {
  weekday: number;
  start_time: string;
  end_time: string;
  is_active?: boolean;
}

export interface ScheduleBlockLike {
  block_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  is_active?: boolean;
  professional_id?: string | null;
}

export interface AppointmentLike {
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  professional_id?: string;
}

export interface TimeRange {
  start_time: string;
  end_time: string;
}

export interface Slot {
  date: string;
  start_time: string;
  end_time: string;
}

/** Normaliza TIME do Postgres ou HH:mm para HH:mm. */
export function normalizeTime(value: string): string {
  const trimmed = (value || '').trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{2}:\d{2}:\d{2}/.test(trimmed)) return trimmed.slice(0, 5);
  return trimmed;
}

export function timeToMinutes(value: string): number {
  const t = normalizeTime(value);
  const [h, m] = t.split(':').map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function addMinutesToTime(value: string, minutes: number): string {
  return minutesToTime(timeToMinutes(value) + minutes);
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  const aStart = timeToMinutes(a.start_time);
  const aEnd = timeToMinutes(a.end_time);
  const bStart = timeToMinutes(b.start_time);
  const bEnd = timeToMinutes(b.end_time);
  if ([aStart, aEnd, bStart, bEnd].some((n) => !Number.isFinite(n))) return false;
  return aStart < bEnd && bStart < aEnd;
}

export function isActiveAppointmentStatus(status: string): boolean {
  return status !== 'cancelled' && status !== 'no_show';
}

/** Partes de data/hora no fuso America/Fortaleza. */
export function zonedParts(
  date: Date,
  timeZone = BOOKING_TIMEZONE,
): { year: number; month: number; day: number; hour: number; minute: number; weekday: BookingWeekday } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const weekdayMap: Record<string, BookingWeekday> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: weekdayMap[get('weekday')] ?? 0,
  };
}

export function formatDateYmd(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function todayYmdInZone(now = new Date(), timeZone = BOOKING_TIMEZONE): string {
  return formatDateYmd(zonedParts(now, timeZone));
}

export function nowMinutesInZone(now = new Date(), timeZone = BOOKING_TIMEZONE): number {
  const p = zonedParts(now, timeZone);
  return p.hour * 60 + p.minute;
}

export function weekdayForDateYmd(dateYmd: string, timeZone = BOOKING_TIMEZONE): BookingWeekday {
  // Meio-dia UTC evita ambiguidade de DST ao derivar weekday local
  const [y, m, d] = dateYmd.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
  return zonedParts(probe, timeZone).weekday;
}

export function parseDateYmd(value: string): { ok: true; ymd: string } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, error: 'invalid_date' };
  }
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return { ok: false, error: 'invalid_date' };
  }
  return { ok: true, ymd: value };
}

export function diffDaysYmd(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function eachDateYmd(fromYmd: string, toYmd: string): string[] {
  const out: string[] = [];
  let cursor = fromYmd;
  while (cursor <= toYmd) {
    out.push(cursor);
    const [y, m, d] = cursor.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    cursor = formatDateYmd({
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
    });
  }
  return out;
}

export function validateAvailabilityWindow(opts: {
  from_date: string;
  to_date: string;
  now?: Date;
  timeZone?: string;
}): { ok: true; from_date: string; to_date: string } | { ok: false; code: string; message: string } {
  const from = parseDateYmd(opts.from_date);
  const to = parseDateYmd(opts.to_date);
  if (!from.ok || !to.ok) {
    return { ok: false, code: 'invalid_date_range', message: 'Datas inválidas' };
  }
  if (from.ymd > to.ymd) {
    return { ok: false, code: 'invalid_date_range', message: 'from_date deve ser anterior ou igual a to_date' };
  }
  const today = todayYmdInZone(opts.now, opts.timeZone);
  if (from.ymd < today) {
    return { ok: false, code: 'invalid_date_range', message: 'from_date não pode ser no passado' };
  }
  if (diffDaysYmd(from.ymd, to.ymd) > MAX_AVAILABILITY_DAYS) {
    return { ok: false, code: 'invalid_date_range', message: `Janela máxima de ${MAX_AVAILABILITY_DAYS} dias` };
  }
  return { ok: true, from_date: from.ymd, to_date: to.ymd };
}

function blockRangesForDate(
  dateYmd: string,
  blocks: ScheduleBlockLike[],
  professionalId: string,
): TimeRange[] {
  const ranges: TimeRange[] = [];
  for (const block of blocks) {
    if (block.is_active === false) continue;
    if (block.block_date !== dateYmd) continue;
    if (block.professional_id && block.professional_id !== professionalId) continue;
    // professional_id null = bloqueio de clínica inteira
    if (block.all_day) {
      ranges.push({ start_time: '00:00', end_time: '23:59' });
      continue;
    }
    if (!block.start_time || !block.end_time) continue;
    ranges.push({
      start_time: normalizeTime(block.start_time),
      end_time: normalizeTime(block.end_time),
    });
  }
  return ranges;
}

function appointmentRangesForDate(
  dateYmd: string,
  appointments: AppointmentLike[],
  professionalId: string,
): TimeRange[] {
  return appointments
    .filter(
      (a) =>
        a.date === dateYmd &&
        (!a.professional_id || a.professional_id === professionalId) &&
        isActiveAppointmentStatus(a.status),
    )
    .map((a) => ({
      start_time: normalizeTime(a.start_time),
      end_time: normalizeTime(a.end_time),
    }));
}

/**
 * Gera slots em que o procedimento cabe por completo na jornada,
 * sem sobrepor bloqueios nem appointments ativos.
 */
export function computeAvailableSlots(opts: {
  from_date: string;
  to_date: string;
  duration_minutes: number;
  professional_id: string;
  work_periods: WorkPeriod[];
  blocks: ScheduleBlockLike[];
  appointments: AppointmentLike[];
  now?: Date;
  timeZone?: string;
}): Slot[] {
  const duration = opts.duration_minutes;
  if (
    !Number.isFinite(duration) ||
    duration < MIN_DURATION_MINUTES ||
    duration > MAX_DURATION_MINUTES
  ) {
    return [];
  }

  const timeZone = opts.timeZone || BOOKING_TIMEZONE;
  const now = opts.now || new Date();
  const today = todayYmdInZone(now, timeZone);
  const nowMins = nowMinutesInZone(now, timeZone);
  const slots: Slot[] = [];

  const activePeriods = opts.work_periods.filter((p) => p.is_active !== false);

  for (const dateYmd of eachDateYmd(opts.from_date, opts.to_date)) {
    const weekday = weekdayForDateYmd(dateYmd, timeZone);
    const dayPeriods = activePeriods.filter((p) => Number(p.weekday) === weekday);
    const busy = [
      ...blockRangesForDate(dateYmd, opts.blocks, opts.professional_id),
      ...appointmentRangesForDate(dateYmd, opts.appointments, opts.professional_id),
    ];

    for (const period of dayPeriods) {
      const periodStart = timeToMinutes(period.start_time);
      const periodEnd = timeToMinutes(period.end_time);
      if (!Number.isFinite(periodStart) || !Number.isFinite(periodEnd) || periodEnd <= periodStart) {
        continue;
      }

      for (let start = periodStart; start + duration <= periodEnd; start += duration) {
        const end = start + duration;
        const candidate: TimeRange = {
          start_time: minutesToTime(start),
          end_time: minutesToTime(end),
        };

        if (dateYmd < today) continue;
        if (dateYmd === today && start < nowMins) continue;

        const blocked = busy.some((b) => rangesOverlap(candidate, b));
        if (blocked) continue;

        slots.push({
          date: dateYmd,
          start_time: candidate.start_time,
          end_time: candidate.end_time,
        });
      }
    }
  }

  return slots;
}

/** Verifica se um slot específico ainda é válido (revalidação no confirm). */
export function isSlotAvailable(opts: {
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  professional_id: string;
  work_periods: WorkPeriod[];
  blocks: ScheduleBlockLike[];
  appointments: AppointmentLike[];
  now?: Date;
  timeZone?: string;
}): boolean {
  const start = normalizeTime(opts.start_time);
  const expectedEnd = addMinutesToTime(start, opts.duration_minutes);
  if (normalizeTime(opts.end_time) !== expectedEnd) return false;

  const slots = computeAvailableSlots({
    from_date: opts.date,
    to_date: opts.date,
    duration_minutes: opts.duration_minutes,
    professional_id: opts.professional_id,
    work_periods: opts.work_periods,
    blocks: opts.blocks,
    appointments: opts.appointments,
    now: opts.now,
    timeZone: opts.timeZone,
  });

  return slots.some((s) => s.date === opts.date && s.start_time === start && s.end_time === expectedEnd);
}

export function normalizePhoneDigits(raw: string): string {
  return (raw || '').replace(/\D/g, '');
}

export function phonesEquivalent(a: string, b: string): boolean {
  const da = normalizePhoneDigits(a);
  const db = normalizePhoneDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const tail = (v: string) => (v.length > 10 ? v.slice(-10) : v);
  return tail(da) === tail(db) && tail(da).length >= 10;
}

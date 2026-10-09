/**
 * Agendamento online e captação do Smart Hub sem backend: mesma lógica das Edge Functions
 * smart-hub-booking / smart-hub-capture, lendo e gravando Agenda, Pacientes e Procedimentos locais.
 */
import { format } from 'date-fns';
import {
  minutesToTime,
  readClinicSettings,
  resolveBusinessHours,
  timeToMinutes,
  type BusinessHours,
} from '@/lib/clinicSettings';
import { createLocalId, readLocal, readLocalList, writeLocal } from '@/lib/localStore';
import { formatCPF, formatPhone } from '@/lib/patientFormat';
import { SCHEDULING_STORAGE_KEYS } from '@/lib/schedulingStorage';
import {
  findHubBySlug,
  findPublishedHubBySlug,
  recordLocalEvent,
  SMART_HUB_STORAGE_KEYS,
} from '@/repositories/smartHub/localRepositories';
import type { Appointment, Patient, Procedure, Professional } from '@/types/scheduling';
import type { SmartHub, SmartHubButton } from '@/types/smartHub';
import type {
  BookingAvailabilityResult,
  BookingCatalogResult,
  BookingConfirmInput,
  BookingConfirmResult,
  BookingSlot,
} from './BookingService';
import type { BookingReadinessSnapshot } from './bookingReadiness';
import type { SmartHubCaptureSubmitInput, SmartHubCaptureSubmitResult } from './CaptureService';
import { resolveCaptureConfig } from './resolveCaptureConfig';

const MIN_DURATION = 5;
const MAX_DURATION = 720;
const MAX_WINDOW_DAYS = 31;
const IDEMPOTENCY_KEY = 'smart-hub:booking-keys';
const INACTIVE_APPOINTMENT_STATUSES = new Set(['cancelled', 'no_show']);

type Failure = { ok: false; code: string };

function fail(code: string): Failure {
  return { ok: false, code };
}

function isValidDuration(minutes: number): boolean {
  return Number.isFinite(minutes) && minutes >= MIN_DURATION && minutes <= MAX_DURATION;
}

function activeProcedures(): Procedure[] {
  return readLocalList<Procedure>(SCHEDULING_STORAGE_KEYS.procedures)
    .filter((p) => p.is_active && isValidDuration(Number(p.duration_minutes)))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function activeProfessionals(): Professional[] {
  return readLocalList<Professional>(SCHEDULING_STORAGE_KEYS.professionals)
    .filter((p) => p.is_active)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function businessHours(): BusinessHours {
  return resolveBusinessHours(readClinicSettings());
}

function workPeriods(hours: BusinessHours): Array<[number, number]> {
  const open = timeToMinutes(hours.start);
  const close = timeToMinutes(hours.end);
  if (!hours.breakStart || !hours.breakEnd) return [[open, close]];
  return [
    [open, timeToMinutes(hours.breakStart)],
    [timeToMinutes(hours.breakEnd), close],
  ];
}

function parseYmd(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function computeSlots(opts: {
  fromDate: string;
  toDate: string;
  durationMinutes: number;
  professionalId: string;
}): BookingSlot[] {
  const from = parseYmd(opts.fromDate);
  const to = parseYmd(opts.toDate);
  if (!from || !to) return [];

  const hours = businessHours();
  const periods = workPeriods(hours);
  const duration = opts.durationMinutes;
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const busy = readLocalList<Appointment>(SCHEDULING_STORAGE_KEYS.appointments).filter(
    (a) => a.professionalId === opts.professionalId && !INACTIVE_APPOINTMENT_STATUSES.has(a.status)
  );

  const slots: BookingSlot[] = [];
  for (const day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
    if (!hours.days.includes(day.getDay())) continue;
    const date = format(day, 'yyyy-MM-dd');
    if (date < today) continue;

    const dayBusy = busy
      .filter((a) => a.date === date)
      .map((a) => [timeToMinutes(a.startTime), timeToMinutes(a.endTime)] as const);

    for (const [periodStart, periodEnd] of periods) {
      for (let start = periodStart; start + duration <= periodEnd; start += duration) {
        const end = start + duration;
        if (date === today && start < nowMinutes) continue;
        if (dayBusy.some(([bStart, bEnd]) => start < bEnd && bStart < end)) continue;
        slots.push({ date, start_time: minutesToTime(start), end_time: minutesToTime(end) });
      }
    }
  }
  return slots;
}

function bookableHub(slug: string, requirePublished: boolean): SmartHub | Failure {
  const hub = requirePublished ? findPublishedHubBySlug(slug) : findHubBySlug(slug);
  if (!hub) return fail('hub_not_found');
  if (hub.public_booking_enabled !== true) return fail('booking_disabled');
  return hub;
}

function isFailure(value: unknown): value is Failure {
  return typeof value === 'object' && value !== null && (value as Failure).ok === false;
}

function phoneDigits(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '');
}

/** Compara telefones ignorando DDI 55. */
function samePhone(a: string, b: string): boolean {
  const strip = (digits: string) => (digits.length > 11 && digits.startsWith('55') ? digits.slice(2) : digits);
  const left = strip(phoneDigits(a));
  return left.length >= 10 && left === strip(phoneDigits(b));
}

function findOrCreatePatient(input: BookingConfirmInput['patient']) {
  const patients = readLocalList<Patient>(SCHEDULING_STORAGE_KEYS.patients);
  const cpfDigits = input.cpf?.replace(/\D/g, '') || '';
  const existing =
    (cpfDigits && patients.find((p) => p.cpf?.replace(/\D/g, '') === cpfDigits)) ||
    patients.find((p) => samePhone(p.phone, input.phone));
  if (existing) {
    // Visitante só completa campos vazios; nunca sobrescreve o cadastro da clínica.
    const completed: Patient = {
      ...existing,
      cpf: existing.cpf || (cpfDigits ? formatCPF(cpfDigits) : null),
      birth_date: existing.birth_date || input.birth_date || null,
      email: existing.email || input.email || null,
      insurance: existing.insurance || input.insurance || null,
    };
    writeLocal(
      SCHEDULING_STORAGE_KEYS.patients,
      patients.map((p) => (p.id === existing.id ? completed : p))
    );
    return { patient: completed, duplicate: true };
  }

  const patient: Patient = {
    id: createLocalId(),
    name: input.name,
    cpf: cpfDigits ? formatCPF(cpfDigits) : null,
    phone: formatPhone(input.phone),
    email: input.email || null,
    birth_date: input.birth_date || null,
    address: null,
    insurance: input.insurance || null,
    clinical_notes: null,
    allergies: [],
    status: 'active',
    created_at: format(new Date(), 'yyyy-MM-dd'),
  };
  writeLocal(SCHEDULING_STORAGE_KEYS.patients, [...patients, patient]);
  return { patient, duplicate: false };
}

export const localBooking = {
  async getCatalog(slug: string): Promise<BookingCatalogResult> {
    const hub = bookableHub(slug, false);
    if (isFailure(hub)) return hub;

    const hasSchedule = businessHours().days.length > 0;
    const professionals = hasSchedule
      ? activeProfessionals().map((p) => ({ id: p.id, name: p.name }))
      : [];

    return {
      ok: true,
      booking_enabled: true,
      procedures: activeProcedures().map((p) => ({
        id: p.id,
        name: p.name,
        duration_minutes: Number(p.duration_minutes),
        professionals,
      })),
    };
  },

  async getAvailability(input: {
    slug: string;
    procedure_id: string;
    professional_id: string;
    from_date: string;
    to_date: string;
  }): Promise<BookingAvailabilityResult> {
    const hub = bookableHub(input.slug, false);
    if (isFailure(hub)) return hub;

    const from = parseYmd(input.from_date);
    const to = parseYmd(input.to_date);
    if (!from || !to || to < from || (to.getTime() - from.getTime()) / 86_400_000 > MAX_WINDOW_DAYS) {
      return fail('invalid_date_range');
    }

    const procedure = activeProcedures().find((p) => p.id === input.procedure_id);
    if (!procedure) return fail('procedure_not_found');
    const professional = activeProfessionals().find((p) => p.id === input.professional_id);
    if (!professional) return fail('professional_not_found');

    return {
      ok: true,
      booking_enabled: true,
      procedure: { id: procedure.id, name: procedure.name, duration_minutes: procedure.duration_minutes },
      professional: { id: professional.id, name: professional.name },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      slots: computeSlots({
        fromDate: input.from_date,
        toDate: input.to_date,
        durationMinutes: Number(procedure.duration_minutes),
        professionalId: professional.id,
      }),
    };
  },

  async confirm(input: BookingConfirmInput): Promise<BookingConfirmResult> {
    const hub = bookableHub(input.slug, true);
    if (isFailure(hub)) return hub;
    if (!input.privacy_accepted) return fail('privacy_required');

    const name = input.patient.name.trim();
    if (!name || phoneDigits(input.patient.phone).length < 10) return fail('invalid_payload');
    const cpfDigits = input.patient.cpf?.replace(/\D/g, '') || '';
    const birth = input.patient.birth_date;
    if ((cpfDigits && cpfDigits.length !== 11) || (birth && (birth > format(new Date(), 'yyyy-MM-dd') || birth < '1900-01-01'))) {
      return fail('invalid_payload');
    }

    const appointments = readLocalList<Appointment>(SCHEDULING_STORAGE_KEYS.appointments);
    const keys = readLocal<Record<string, string>>(IDEMPOTENCY_KEY) ?? {};
    const previous = appointments.find((a) => a.id === keys[input.idempotency_key]);
    if (previous) {
      return {
        ok: true,
        success: true,
        appointment_id: previous.id,
        status: previous.status,
        patient_id: previous.patientId ?? undefined,
        duplicate_patient: true,
        slot: {
          date: previous.date,
          start_time: previous.startTime,
          end_time: previous.endTime,
          professional_id: previous.professionalId,
        },
      };
    }

    const procedure = activeProcedures().find((p) => p.id === input.procedure_id);
    if (!procedure) return fail('procedure_not_found');
    const professional = activeProfessionals().find((p) => p.id === input.professional_id);
    if (!professional) return fail('professional_not_found');

    const duration = Number(procedure.duration_minutes);
    const slotFor = (professionalId: string) =>
      computeSlots({ fromDate: input.date, toDate: input.date, durationMinutes: duration, professionalId }).find(
        (s) => s.start_time === input.start_time
      );
    const slot = slotFor(professional.id);
    if (!slot) {
      const inSchedule = computeSlots({
        fromDate: input.date,
        toDate: input.date,
        durationMinutes: duration,
        professionalId: '__schedule_only__',
      }).some((s) => s.start_time === input.start_time);
      return fail(inSchedule ? 'slot_taken' : 'outside_work_schedule');
    }

    const { patient, duplicate } = findOrCreatePatient({ ...input.patient, name });

    const appointment: Appointment = {
      id: createLocalId(),
      date: slot.date,
      startTime: slot.start_time,
      endTime: slot.end_time,
      patientName: patient.name,
      patientPhone: patient.phone,
      patientId: patient.id,
      professionalId: professional.id,
      procedure: procedure.name,
      procedureId: procedure.id,
      procedurePrice: procedure.default_price,
      status: 'confirmed',
      paymentStatus: 'pending',
      notes: [input.notes?.trim(), `Agendamento online Smart Hub (${hub.slug})`].filter(Boolean).join('\n'),
    };
    writeLocal(SCHEDULING_STORAGE_KEYS.appointments, [...appointments, appointment]);
    writeLocal(IDEMPOTENCY_KEY, { ...keys, [input.idempotency_key]: appointment.id });
    recordLocalEvent(hub, 'booking_confirmed', procedure.name, {
      appointment_id: appointment.id,
      professional_name: professional.name,
      date: slot.date,
      start_time: slot.start_time,
    });

    return {
      ok: true,
      success: true,
      appointment_id: appointment.id,
      status: appointment.status,
      patient_id: patient.id,
      duplicate_patient: duplicate,
      slot: { ...slot, professional_id: professional.id },
    };
  },
};

export function localBookingReadinessSnapshot(params: {
  hasSmartHubModule: boolean;
  hasAgendaModule: boolean;
}): BookingReadinessSnapshot {
  const professionals = readLocalList<Professional>(SCHEDULING_STORAGE_KEYS.professionals);
  const hasSchedule = businessHours().days.length > 0;
  return {
    ...params,
    procedures: readLocalList<Procedure>(SCHEDULING_STORAGE_KEYS.procedures).map((p) => ({
      id: p.id,
      is_active: p.is_active,
      duration_minutes: Number(p.duration_minutes),
    })),
    professionals: professionals.map((p) => ({
      id: p.id,
      is_active: p.is_active,
      performs_all_procedures: true,
    })),
    workSchedules: hasSchedule
      ? professionals.filter((p) => p.is_active).map((p) => ({ professional_id: p.id, is_active: true }))
      : [],
    links: [],
  };
}

export interface SmartHubLead {
  id: string;
  clinic_id: string;
  hub_id: string;
  button_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  interest: string | null;
  message: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  stage: string;
  utm_source: string | null;
  utm_campaign: string | null;
  is_test: boolean;
  created_at: string;
  updated_at: string;
}

export function buildWhatsappUrl(phone: string, message: string | null): string {
  const digits = phoneDigits(phone);
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return message ? `https://wa.me/${full}?text=${encodeURIComponent(message)}` : `https://wa.me/${full}`;
}

export const localCapture = {
  async submit(input: SmartHubCaptureSubmitInput): Promise<SmartHubCaptureSubmitResult> {
    const hub = findPublishedHubBySlug(input.slug);
    if (input.action === 'validate') {
      const issues: string[] = [];
      if (!hub) issues.push('Publique o Smart Hub para receber contatos.');
      return issues.length
        ? { ok: false, ready: false, issues, message: 'Corrija os seguintes itens:' }
        : { ok: true, ready: true, message: 'Formulário pronto para receber contatos.' };
    }
    if (!hub) return { ok: false, code: 'hub_unavailable' };

    const button = input.button_id
      ? readLocalList<SmartHubButton>(SMART_HUB_STORAGE_KEYS.buttons).find(
          (b) => b.id === input.button_id && b.hub_id === hub.id && !b.deleted_at
        )
      : undefined;
    const config = resolveCaptureConfig(hub.capture_config, button?.capture_config);

    // Honeypot preenchido: responde sucesso sem gravar (bot).
    if (input.website) return { ok: true, message: config.success_message };

    const name = input.name.trim();
    if (!name) return { ok: false, code: 'invalid_name' };
    if (phoneDigits(input.phone).length < 10) return { ok: false, code: 'invalid_phone' };
    if (config.require_privacy_accept && !input.privacy_accepted) {
      return { ok: false, code: 'consent_required' };
    }

    const now = new Date().toISOString();
    const leads = readLocalList<SmartHubLead>(SMART_HUB_STORAGE_KEYS.leads);
    const isTest = input.action === 'test';
    const existing = isTest
      ? undefined
      : leads.find((l) => l.hub_id === hub.id && !l.is_test && samePhone(l.phone, input.phone));
    const fields = {
      name,
      phone: formatPhone(input.phone),
      email: input.email?.trim() || null,
      interest: input.interest?.trim() || config.interest || button?.title || null,
      message: input.message?.trim() || null,
      preferred_date: input.preferred_date?.trim() || null,
      preferred_time: input.preferred_time?.trim() || null,
      updated_at: now,
    };

    if (existing) {
      writeLocal(
        SMART_HUB_STORAGE_KEYS.leads,
        leads.map((l) => (l.id === existing.id ? { ...l, ...fields } : l))
      );
    } else {
      writeLocal(SMART_HUB_STORAGE_KEYS.leads, [
        ...leads,
        {
          id: createLocalId(),
          clinic_id: hub.clinic_id,
          hub_id: hub.id,
          button_id: button?.id ?? null,
          stage: config.initial_stage,
          utm_source: input.utm_source ?? null,
          utm_campaign: input.utm_campaign ?? null,
          is_test: isTest,
          created_at: now,
          ...fields,
        },
      ]);
    }
    recordLocalEvent(hub, existing ? 'form_duplicate' : 'form_submitted', button?.title ?? 'Formulário', {
      button_id: button?.id ?? null,
      test: isTest,
    });

    return {
      ok: true,
      result: existing ? 'updated' : 'created',
      created: !existing,
      duplicate: Boolean(existing),
      stage: config.initial_stage,
      message: isTest ? 'Lead de teste criado.' : config.success_message,
      redirect_url: config.redirect_url,
      whatsapp_url:
        config.redirect_whatsapp_after_submit && config.whatsapp_phone
          ? buildWhatsappUrl(config.whatsapp_phone, config.whatsapp_message)
          : null,
    };
  },
};

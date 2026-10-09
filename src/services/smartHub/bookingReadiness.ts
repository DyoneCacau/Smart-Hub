import { isSupabaseConfigured } from '@/integrations/supabase/client';
import { remoteDb } from '@/integrations/supabase/remoteDb';
import { DEFAULT_BUSINESS_HOURS, type BusinessHours } from '@/lib/clinicSettings';
import { localBookingReadinessSnapshot } from './localBooking';
import {
  buildBookingCatalogProcedures,
  type ProfessionalProcedureLink,
} from './professionalProcedureEligibility';

/** Espelha MIN/MAX da Edge smart-hub-booking. */
export const BOOKING_MIN_DURATION_MINUTES = 5;
export const BOOKING_MAX_DURATION_MINUTES = 720;

export interface BookingReadinessItem {
  id: string;
  label: string;
  ok: boolean;
}

export interface BookingReadinessResult {
  ok: boolean;
  items: BookingReadinessItem[];
}

export interface BookingReadinessSnapshot {
  hasSmartHubModule: boolean;
  hasAgendaModule: boolean;
  procedures: Array<{ id: string; is_active: boolean; duration_minutes: number }>;
  professionals: Array<{
    id: string;
    is_active: boolean;
    performs_all_procedures: boolean;
  }>;
  workSchedules: Array<{ professional_id: string; is_active: boolean }>;
  links: ProfessionalProcedureLink[];
}

export function isValidBookingDuration(minutes: number): boolean {
  return (
    Number.isFinite(minutes) &&
    minutes >= BOOKING_MIN_DURATION_MINUTES &&
    minutes <= BOOKING_MAX_DURATION_MINUTES
  );
}

/**
 * Avalia prontidão para ativar public_booking_enabled.
 * Não cria dados — apenas checklist objetivo.
 */
export function evaluateBookingReadiness(
  snapshot: BookingReadinessSnapshot
): BookingReadinessResult {
  const activeProcedures = snapshot.procedures.filter(
    (p) => p.is_active !== false && isValidBookingDuration(Number(p.duration_minutes))
  );
  const activeProfessionals = snapshot.professionals.filter((p) => p.is_active !== false);
  const activeScheduleProfIds = new Set(
    snapshot.workSchedules
      .filter((s) => s.is_active !== false)
      .map((s) => s.professional_id)
  );
  const professionalsWithSchedule = activeProfessionals.filter((p) =>
    activeScheduleProfIds.has(p.id)
  );

  const catalog = buildBookingCatalogProcedures(
    activeProcedures.map((p) => ({
      id: p.id,
      name: p.id,
      duration_minutes: Number(p.duration_minutes),
    })),
    professionalsWithSchedule.map((p) => ({
      id: p.id,
      name: p.id,
      performs_all_procedures: p.performs_all_procedures !== false,
    })),
    snapshot.links
  );

  const hasEligibleCombo = catalog.some((proc) => proc.professionals.length > 0);

  const items: BookingReadinessItem[] = [
    {
      id: 'module_smart_hub',
      label: 'Módulo Smart Hub disponível no plano',
      ok: snapshot.hasSmartHubModule === true,
    },
    {
      id: 'module_agenda',
      label: 'Módulo Agenda disponível no plano',
      ok: snapshot.hasAgendaModule === true,
    },
    {
      id: 'procedure_active',
      label: 'Pelo menos um procedimento ativo com duração válida (5–720 min)',
      ok: activeProcedures.length > 0,
    },
    {
      id: 'professional_active',
      label: 'Pelo menos um profissional ativo',
      ok: activeProfessionals.length > 0,
    },
    {
      id: 'work_schedule',
      label: 'Pelo menos uma jornada ativa cadastrada',
      ok: professionalsWithSchedule.length > 0,
    },
    {
      id: 'eligible_combo',
      label: 'Combinação elegível profissional ↔ procedimento com jornada',
      ok: hasEligibleCombo,
    },
  ];

  return {
    ok: items.every((i) => i.ok),
    items,
  };
}

export function formatBookingReadinessChecklist(
  items: BookingReadinessItem[]
): string {
  return items
    .map((i) => `${i.ok ? '✓' : '✗'} ${i.label}`)
    .join('\n');
}

/** Carrega snapshot da clínica e avalia (sem criar registros). */
export async function fetchBookingReadiness(params: {
  clinicId: string;
  hasSmartHubModule: boolean;
  hasAgendaModule: boolean;
}): Promise<BookingReadinessResult> {
  const { clinicId, hasSmartHubModule, hasAgendaModule } = params;

  if (!isSupabaseConfigured) {
    return evaluateBookingReadiness(
      localBookingReadinessSnapshot({ hasSmartHubModule, hasAgendaModule })
    );
  }

  const [procRes, profRes, clinicRes] = await Promise.all([
    remoteDb
      .from('procedures')
      .select('id, is_active, duration_minutes')
      .eq('clinic_id', clinicId),
    remoteDb.from('professionals').select('id, is_active').eq('clinic_id', clinicId),
    remoteDb.from('clinics').select('business_hours').eq('id', clinicId).maybeSingle(),
  ]);

  if (procRes.error) throw procRes.error;
  if (profRes.error) throw profRes.error;
  if (clinicRes.error) throw clinicRes.error;

  const professionals = (profRes.data || []) as Array<{ id: string; is_active: boolean | null }>;
  const storedHours = clinicRes.data?.business_hours as Partial<BusinessHours> | null | undefined;
  const days = Array.isArray(storedHours?.days) ? storedHours.days : DEFAULT_BUSINESS_HOURS.days;

  return evaluateBookingReadiness({
    hasSmartHubModule,
    hasAgendaModule,
    procedures: ((procRes.data || []) as Array<{ id: string; is_active: boolean | null; duration_minutes: number }>).map(
      (p) => ({
        id: p.id,
        is_active: p.is_active !== false,
        duration_minutes: Number(p.duration_minutes),
      })
    ),
    professionals: professionals.map((p) => ({
      id: p.id,
      is_active: p.is_active !== false,
      performs_all_procedures: true,
    })),
    workSchedules:
      days.length > 0
        ? professionals
            .filter((p) => p.is_active !== false)
            .map((p) => ({ professional_id: p.id, is_active: true }))
        : [],
    links: [],
  });
}

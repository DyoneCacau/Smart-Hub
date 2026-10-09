import type { HealthSegmentId } from '@/lib/healthSegments';
import { readLocal } from '@/lib/localStore';

export interface BusinessHours {
  /** 0 = domingo ... 6 = sábado */
  days: number[];
  /** HH:mm */
  start: string;
  /** HH:mm */
  end: string;
  /** Intervalo sem atendimento (almoço); null quando não há. */
  breakStart: string | null;
  breakEnd: string | null;
}

export interface ClinicSettings {
  name: string;
  segment: HealthSegmentId;
  /** Usado para gerar os horários livres do agendamento online. */
  businessHours?: BusinessHours;
}

export const CLINIC_SETTINGS_KEY = 'settings:clinic';
export const LOCAL_CLINIC_ID = 'local-clinic';

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  days: [1, 2, 3, 4, 5],
  start: '08:00',
  end: '18:00',
  breakStart: '12:00',
  breakEnd: '13:00',
};

export const WEEKDAY_SHORT_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function resolveBusinessHours(settings: ClinicSettings | null | undefined): BusinessHours {
  return settings?.businessHours ?? DEFAULT_BUSINESS_HOURS;
}

export function readClinicSettings(): ClinicSettings | null {
  return readLocal<ClinicSettings>(CLINIC_SETTINGS_KEY);
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

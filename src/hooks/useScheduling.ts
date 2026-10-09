import { useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { isSupabaseConfigured } from '@/integrations/supabase/client';
import type { ServiceTemplate } from '@/lib/healthSegments';
import { SCHEDULING_STORAGE_KEYS } from '@/lib/schedulingStorage';
import { useLocalCollection } from './useLocalCollection';
import { useRemoteCollection, type RemoteCollectionSpec } from './useRemoteCollection';
import type {
  Appointment,
  AppointmentStatus,
  PatientStatus,
  Patient,
  PatientInput,
  PaymentStatus,
  Procedure,
  ProcedureBillingUnit,
  Professional,
} from '@/types/scheduling';

type Row = Record<string, unknown>;

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const strOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined || value === '' ? null : Number(value);
/** Colunas TIME voltam como HH:mm:ss. */
const hhmm = (value: unknown): string => str(value).slice(0, 5);

const PROFESSIONALS_SPEC: RemoteCollectionSpec<Professional> = {
  table: 'professionals',
  columns: {
    name: 'name',
    specialty: 'specialty',
    council: 'council',
    registration: 'registration',
    email: 'email',
    phone: 'phone',
    is_active: 'is_active',
    hire_date: 'hire_date',
  },
  fromRow: (row: Row) => ({
    id: str(row.id),
    name: str(row.name),
    specialty: str(row.specialty),
    council: strOrNull(row.council),
    registration: strOrNull(row.registration),
    email: strOrNull(row.email),
    phone: strOrNull(row.phone),
    is_active: row.is_active !== false,
    hire_date: strOrNull(row.hire_date),
  }),
};

const PROCEDURES_SPEC: RemoteCollectionSpec<Procedure> = {
  table: 'procedures',
  columns: {
    name: 'name',
    category: 'category',
    description: 'description',
    default_price: 'default_price',
    duration_minutes: 'duration_minutes',
    billing_unit: 'billing_unit',
    default_commission: 'default_commission',
    preparation: 'preparation',
    is_active: 'is_active',
  },
  fromRow: (row: Row) => ({
    id: str(row.id),
    name: str(row.name),
    category: str(row.category),
    description: strOrNull(row.description),
    default_price: Number(row.default_price ?? 0),
    duration_minutes: Number(row.duration_minutes ?? 30),
    billing_unit: (str(row.billing_unit) || 'appointment') as ProcedureBillingUnit,
    default_commission: numOrNull(row.default_commission),
    preparation: strOrNull(row.preparation),
    is_active: row.is_active !== false,
  }),
};

const PATIENTS_SPEC: RemoteCollectionSpec<Patient> = {
  table: 'patients',
  columns: {
    name: 'name',
    cpf: 'cpf',
    phone: 'phone',
    email: 'email',
    birth_date: 'birth_date',
    address: 'address',
    insurance: 'insurance',
    clinical_notes: 'clinical_notes',
    allergies: 'allergies',
    status: 'status',
    created_at: 'created_at',
  },
  fromRow: (row: Row) => ({
    id: str(row.id),
    name: str(row.name),
    cpf: strOrNull(row.cpf),
    phone: str(row.phone),
    email: strOrNull(row.email),
    birth_date: strOrNull(row.birth_date),
    address: strOrNull(row.address),
    insurance: strOrNull(row.insurance),
    clinical_notes: strOrNull(row.clinical_notes),
    allergies: Array.isArray(row.allergies) ? (row.allergies as string[]) : [],
    status: (str(row.status) || 'active') as PatientStatus,
    created_at: str(row.created_at),
  }),
};

const APPOINTMENTS_SPEC: RemoteCollectionSpec<Appointment> = {
  table: 'appointments',
  columns: {
    date: 'date',
    startTime: 'start_time',
    endTime: 'end_time',
    patientName: 'patient_name',
    patientPhone: 'patient_phone',
    patientId: 'patient_id',
    professionalId: 'professional_id',
    procedure: 'procedure_name',
    procedureId: 'procedure_id',
    procedurePrice: 'procedure_price',
    status: 'status',
    paymentStatus: 'payment_status',
    notes: 'notes',
  },
  fromRow: (row: Row) => ({
    id: str(row.id),
    date: str(row.date),
    startTime: hhmm(row.start_time),
    endTime: hhmm(row.end_time),
    patientName: str(row.patient_name),
    patientPhone: strOrNull(row.patient_phone) ?? undefined,
    patientId: strOrNull(row.patient_id),
    professionalId: str(row.professional_id),
    procedure: str(row.procedure_name),
    procedureId: strOrNull(row.procedure_id),
    procedurePrice: numOrNull(row.procedure_price),
    status: (str(row.status) || 'pending') as AppointmentStatus,
    paymentStatus: (str(row.payment_status) || 'pending') as PaymentStatus,
    notes: strOrNull(row.notes) ?? undefined,
  }),
  // Agendamentos feitos pelo Smart Hub aparecem sem precisar recarregar a página.
  refetchIntervalMs: 30_000,
};

/** Dados da clínica no Supabase quando configurado; senão, no navegador. */
function useClinicCollection<T extends { id: string }>(localKey: string, spec: RemoteCollectionSpec<T>) {
  const local = useLocalCollection<T>(localKey);
  const remote = useRemoteCollection<T>(spec);
  return isSupabaseConfigured ? remote : local;
}

export function usePatients() {
  const { items, create, update, remove } = useClinicCollection<Patient>(SCHEDULING_STORAGE_KEYS.patients, PATIENTS_SPEC);

  const patients = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [items],
  );
  const activePatients = useMemo(() => patients.filter((p) => p.status === 'active'), [patients]);

  const createPatient = useCallback(
    (input: PatientInput) => create({ ...input, created_at: format(new Date(), 'yyyy-MM-dd') }),
    [create],
  );

  return {
    patients,
    activePatients,
    createPatient,
    updatePatient: update,
    removePatient: remove,
  };
}

type StoredProfessional = Professional & { cro?: string };

/** Cadastros antigos só tinham o campo `cro`. */
function normalizeProfessional({ cro, ...professional }: StoredProfessional): Professional {
  if (professional.council !== undefined) return professional;
  return { ...professional, council: cro ? 'CRO' : null, registration: cro || null };
}

export function professionalRegistration(professional: Pick<Professional, 'council' | 'registration'>): string | null {
  if (!professional.registration) return null;
  return professional.council ? `${professional.council} ${professional.registration}` : professional.registration;
}

export function useProfessionals() {
  const { items, create, update, remove } = useClinicCollection<StoredProfessional>(
    SCHEDULING_STORAGE_KEYS.professionals,
    PROFESSIONALS_SPEC,
  );

  const professionals = useMemo(
    () => items.map(normalizeProfessional).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [items],
  );
  const activeProfessionals = useMemo(() => professionals.filter((p) => p.is_active), [professionals]);

  return {
    professionals,
    activeProfessionals,
    createProfessional: create,
    updateProfessional: update,
    removeProfessional: remove,
  };
}

export function useProcedures() {
  const { items, create, createMany, update, remove } = useClinicCollection<Procedure>(
    SCHEDULING_STORAGE_KEYS.procedures,
    PROCEDURES_SPEC,
  );

  const procedures = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [items],
  );
  const activeProcedures = useMemo(() => procedures.filter((p) => p.is_active), [procedures]);

  /** Cadastra os modelos que ainda não existem (comparando pelo nome) e retorna quantos foram criados. */
  const addProcedureTemplates = useCallback(
    (templates: ServiceTemplate[]): number => {
      const existing = new Set(items.map((p) => p.name.trim().toLowerCase()));
      const missing = templates.filter((t) => !existing.has(t.name.trim().toLowerCase()));
      createMany(
        missing.map((t) => ({
          name: t.name,
          category: t.category,
          description: null,
          default_price: 0,
          duration_minutes: t.duration_minutes,
          billing_unit: 'appointment',
          default_commission: null,
          preparation: t.preparation ?? null,
          is_active: true,
        })),
      );
      return missing.length;
    },
    [items, createMany],
  );

  return {
    procedures,
    activeProcedures,
    createProcedure: create,
    addProcedureTemplates,
    updateProcedure: update,
    removeProcedure: remove,
  };
}

export function useAppointments() {
  const { items, create, update, remove } = useClinicCollection<Appointment>(
    SCHEDULING_STORAGE_KEYS.appointments,
    APPOINTMENTS_SPEC,
  );

  return {
    appointments: items,
    createAppointment: create,
    updateAppointment: update,
    removeAppointment: remove,
  };
}

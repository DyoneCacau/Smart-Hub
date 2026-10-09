export interface Professional {
  id: string;
  name: string;
  specialty: string;
  /** Sigla do conselho (CRM, CRO, CRBM...); null para quem não tem registro, como recepção ou coleta. */
  council: string | null;
  registration: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  hire_date: string | null;
}

export type ProfessionalInput = Omit<Professional, 'id'>;

export type PatientStatus = 'active' | 'inactive';

export interface Patient {
  id: string;
  name: string;
  cpf: string | null;
  phone: string;
  email: string | null;
  /** yyyy-MM-dd */
  birth_date: string | null;
  address: string | null;
  /** Convênio ou "Particular". */
  insurance?: string | null;
  clinical_notes: string | null;
  allergies: string[];
  status: PatientStatus;
  /** yyyy-MM-dd */
  created_at: string;
}

export type PatientInput = Omit<Patient, 'id' | 'created_at'>;

export type ProcedureBillingUnit = 'appointment' | 'session' | 'unit' | 'ml' | 'arch';

export const BILLING_UNIT_LABELS: Record<ProcedureBillingUnit, string> = {
  appointment: 'Atendimento',
  session: 'Sessão',
  unit: 'Unidade',
  ml: 'ml',
  arch: 'Arcada',
};

export interface Procedure {
  id: string;
  name: string;
  category: string;
  description: string | null;
  default_price: number;
  duration_minutes: number;
  billing_unit: ProcedureBillingUnit;
  default_commission: number | null;
  /** Orientação enviada ao paciente antes do atendimento (jejum, bexiga cheia...). */
  preparation?: string | null;
  is_active: boolean;
}

export type ProcedureInput = Omit<Procedure, 'id'>;

export type AppointmentStatus = 'pending' | 'confirmed' | 'return' | 'completed' | 'cancelled' | 'no_show';
export type PaymentStatus = 'pending' | 'paid' | 'partial' | 'refunded';

export interface Appointment {
  id: string;
  /** yyyy-MM-dd */
  date: string;
  /** HH:mm */
  startTime: string;
  /** HH:mm */
  endTime: string;
  patientName: string;
  patientPhone?: string;
  patientId?: string | null;
  professionalId: string;
  procedure: string;
  procedureId?: string | null;
  procedurePrice?: number | null;
  status: AppointmentStatus;
  paymentStatus: PaymentStatus;
  notes?: string;
}

export type AppointmentInput = Omit<Appointment, 'id'>;

/** Agendamento com o profissional resolvido, pronto para exibição. */
export interface AgendaEntry extends Appointment {
  professionalName: string;
}

export type AgendaView = 'day' | 'week' | 'month';

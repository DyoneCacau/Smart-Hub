import type { LeadSource } from '@/types/agenda';

export type CrmLeadStage = 'new' | 'contact' | 'scheduled' | 'won' | 'lost';

export interface CrmLead {
  id: string;
  clinicId: string;
  name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  stage: CrmLeadStage;
  leadSource: LeadSource | null;
  referralName: string | null;
  interest: string | null;
  estimatedValue: number | null;
  nextFollowUp: string | null;
  notes: string | null;
  allergies: string[];
  ownerUserId: string | null;
  ownerName?: string | null;
  patientId: string | null;
  appointmentId: string | null;
  lostReason: string | null;
  /** Integração que trouxe o lead (null = criado no Kanban) */
  integrationId: string | null;
  /** Id do lead no provedor de origem */
  externalLeadId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrmLeadInput {
  name?: string;
  cpf?: string | null;
  phone?: string | null;
  email?: string | null;
  stage?: CrmLeadStage;
  lead_source?: LeadSource | null;
  referral_name?: string | null;
  interest?: string | null;
  estimated_value?: number | null;
  next_follow_up?: string | null;
  notes?: string | null;
  allergies?: string[];
  owner_user_id?: string | null;
  patient_id?: string | null;
  appointment_id?: string | null;
  lost_reason?: string | null;
}

export const CRM_STAGES: {
  id: CrmLeadStage;
  label: string;
  description: string;
  tone: string;
}[] = [
  {
    id: 'new',
    label: 'Novo',
    description: 'Lead captado, ainda sem contato',
    tone: 'bg-sky-50 border-sky-200',
  },
  {
    id: 'contact',
    label: 'Em contato',
    description: 'Follow-up em andamento',
    tone: 'bg-amber-50 border-amber-200',
  },
  {
    id: 'scheduled',
    label: 'Agendado',
    description: 'Consulta marcada na agenda',
    tone: 'bg-violet-50 border-violet-200',
  },
  {
    id: 'won',
    label: 'Fechado',
    description: 'Converteu em paciente/tratamento',
    tone: 'bg-emerald-50 border-emerald-200',
  },
  {
    id: 'lost',
    label: 'Perdido',
    description: 'Não avançou',
    tone: 'bg-slate-50 border-slate-200',
  },
];

export const CRM_STAGE_LABELS: Record<CrmLeadStage, string> = {
  new: 'Novo',
  contact: 'Em contato',
  scheduled: 'Agendado',
  won: 'Fechado',
  lost: 'Perdido',
};

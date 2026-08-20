export type CrmLeadStage = string;

export interface CrmStage {
  id: string;
  workspaceId: string;
  name: string;
  position: number;
  isWon: boolean;
  isLost: boolean;
}

export interface CrmLead {
  id: string;
  workspaceId: string;
  stageId: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  interest: string | null;
  estimatedValue: number | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  firstTouchSource: string | null;
  firstTouchMedium: string | null;
  firstTouchCampaign: string | null;
  lastTouchSource: string | null;
  lastTouchMedium: string | null;
  lastTouchCampaign: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  ownerUserId: string | null;
  integrationId: string | null;
  externalLeadId: string | null;
  visitorId: string | null;
  status: string;
  lostReason: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;

  /** Campos legados opcionais mantidos apenas durante a migração dos componentes antigos. */
  leadSource?: string | null;
  clinicId?: string;
  referralName?: string | null;
  nextFollowUp?: string | null;
  allergies?: string[];
  patientId?: string | null;
  appointmentId?: string | null;
  ownerName?: string | null;
}

export interface CrmLeadInput {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  interest?: string | null;
  estimated_value?: number | null;
  stage_id?: string | null;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  owner_user_id?: string | null;
  lost_reason?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

/** Compatibilidade temporária para componentes antigos ainda presentes no snapshot. */
export const CRM_STAGES = [
  { id: 'new', label: 'Novo', description: 'Lead captado', tone: '' },
  { id: 'contact', label: 'Contato', description: 'Contato em andamento', tone: '' },
  { id: 'qualified', label: 'Qualificado', description: 'Lead qualificado', tone: '' },
  { id: 'opportunity', label: 'Oportunidade', description: 'Oportunidade ativa', tone: '' },
  { id: 'won', label: 'Fechado', description: 'Conversão concluída', tone: '' },
  { id: 'lost', label: 'Perdido', description: 'Oportunidade perdida', tone: '' },
] as const;

export const CRM_STAGE_LABELS: Record<string, string> = Object.fromEntries(
  CRM_STAGES.map((stage) => [stage.id, stage.label]),
);

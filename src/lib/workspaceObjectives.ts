import type { BusinessSegment } from '@/lib/segmentPresets';

export type WorkspaceObjective =
  | 'sales'
  | 'lead_capture'
  | 'bookings'
  | 'quotes'
  | 'enrollments'
  | 'b2b_prospecting'
  | 'commercial_service'
  | 'custom';

export interface WorkspaceObjectivePreset {
  id: WorkspaceObjective;
  label: string;
  description: string;
}

export const WORKSPACE_OBJECTIVES: WorkspaceObjectivePreset[] = [
  { id: 'sales', label: 'Vendas', description: 'Acompanhar oportunidades até a venda ou contrato.' },
  { id: 'lead_capture', label: 'Captação de leads', description: 'Centralizar contatos vindos de campanhas, links e formulários.' },
  { id: 'bookings', label: 'Agendamentos', description: 'Transformar interesse em horário, visita ou atendimento marcado.' },
  { id: 'quotes', label: 'Orçamentos', description: 'Receber demandas, qualificar e acompanhar propostas comerciais.' },
  { id: 'enrollments', label: 'Matrículas / inscrições', description: 'Acompanhar interessados até inscrição ou matrícula.' },
  { id: 'b2b_prospecting', label: 'Prospecção B2B', description: 'Gerir contas, diagnóstico, proposta e negociação.' },
  { id: 'commercial_service', label: 'Atendimento comercial', description: 'Organizar solicitações e oportunidades que chegam ao time.' },
  { id: 'custom', label: 'Outro objetivo', description: 'Começar com um modelo flexível e personalizar depois.' },
];

const OBJECTIVE_STAGE_PRESETS: Partial<Record<WorkspaceObjective, string[]>> = {
  lead_capture: ['Novo', 'Contato', 'Qualificado', 'Oportunidade', 'Convertido', 'Perdido'],
  bookings: ['Novo', 'Contato', 'Qualificado', 'Agendamento', 'Confirmado', 'Perdido'],
  quotes: ['Novo', 'Briefing recebido', 'Qualificação', 'Reunião', 'Proposta', 'Negociação', 'Fechado', 'Perdido'],
  enrollments: ['Novo', 'Contato', 'Qualificado', 'Inscrição', 'Matrícula', 'Perdido'],
  b2b_prospecting: ['Novo', 'Contato', 'Diagnóstico', 'Qualificado', 'Proposta', 'Negociação', 'Fechado', 'Perdido'],
  commercial_service: ['Novo', 'Em atendimento', 'Qualificado', 'Oportunidade', 'Resolvido', 'Perdido'],
};

export function getObjectiveStages(segment: BusinessSegment, objective: WorkspaceObjective, segmentStages: string[]) {
  if (objective === 'sales' || objective === 'custom') return segmentStages;
  if (segment === 'education' && objective === 'enrollments') return OBJECTIVE_STAGE_PRESETS.enrollments!;
  if ((segment === 'health_wellness' || segment === 'hospitality' || segment === 'real_estate') && objective === 'bookings') return OBJECTIVE_STAGE_PRESETS.bookings!;
  return OBJECTIVE_STAGE_PRESETS[objective] ?? segmentStages;
}

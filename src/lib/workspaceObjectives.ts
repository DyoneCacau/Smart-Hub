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

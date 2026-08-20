export type BusinessSegment =
  | 'products'
  | 'services'
  | 'real_estate'
  | 'education'
  | 'health_wellness'
  | 'hospitality'
  | 'b2b'
  | 'other';

export interface SegmentPreset {
  id: BusinessSegment;
  label: string;
  description: string;
  entityLabel: string;
  conversionLabel: string;
  defaultStages: string[];
}

export const SEGMENT_PRESETS: SegmentPreset[] = [
  {
    id: 'products',
    label: 'Venda de produtos',
    description: 'Lojas, e-commerce, distribuidores e varejo.',
    entityLabel: 'Cliente',
    conversionLabel: 'Venda',
    defaultStages: ['Novo', 'Contato', 'Qualificado', 'Proposta', 'Venda', 'Perdido'],
  },
  {
    id: 'services',
    label: 'Prestação de serviços',
    description: 'Profissionais, empresas de serviço e atendimento consultivo.',
    entityLabel: 'Cliente',
    conversionLabel: 'Contrato',
    defaultStages: ['Novo', 'Contato', 'Qualificado', 'Proposta', 'Fechado', 'Perdido'],
  },
  {
    id: 'real_estate',
    label: 'Imobiliário',
    description: 'Imobiliárias, corretores e incorporadoras.',
    entityLabel: 'Interessado',
    conversionLabel: 'Negócio',
    defaultStages: ['Novo', 'Contato', 'Qualificado', 'Visita', 'Proposta', 'Fechado', 'Perdido'],
  },
  {
    id: 'education',
    label: 'Educação',
    description: 'Escolas, cursos, faculdades e treinamentos.',
    entityLabel: 'Interessado',
    conversionLabel: 'Matrícula',
    defaultStages: ['Novo', 'Contato', 'Qualificado', 'Inscrição', 'Matrícula', 'Perdido'],
  },
  {
    id: 'health_wellness',
    label: 'Saúde e bem-estar',
    description: 'Clínicas, academias, estética e profissionais de saúde.',
    entityLabel: 'Lead',
    conversionLabel: 'Conversão',
    defaultStages: ['Novo', 'Contato', 'Qualificado', 'Agendamento', 'Convertido', 'Perdido'],
  },
  {
    id: 'hospitality',
    label: 'Alimentação e hospitalidade',
    description: 'Restaurantes, eventos, hotéis e espaços.',
    entityLabel: 'Cliente',
    conversionLabel: 'Reserva',
    defaultStages: ['Novo', 'Contato', 'Qualificado', 'Reserva', 'Confirmado', 'Perdido'],
  },
  {
    id: 'b2b',
    label: 'B2B / consultoria',
    description: 'Empresas, consultorias, software e vendas complexas.',
    entityLabel: 'Conta',
    conversionLabel: 'Contrato',
    defaultStages: ['Novo', 'Contato', 'Qualificado', 'Diagnóstico', 'Proposta', 'Negociação', 'Fechado', 'Perdido'],
  },
  {
    id: 'other',
    label: 'Outro segmento',
    description: 'Comece com um funil genérico e personalize depois.',
    entityLabel: 'Lead',
    conversionLabel: 'Conversão',
    defaultStages: ['Novo', 'Contato', 'Qualificado', 'Oportunidade', 'Fechado', 'Perdido'],
  },
];

export const getSegmentPreset = (segment: BusinessSegment) =>
  SEGMENT_PRESETS.find((item) => item.id === segment) ?? SEGMENT_PRESETS[SEGMENT_PRESETS.length - 1];

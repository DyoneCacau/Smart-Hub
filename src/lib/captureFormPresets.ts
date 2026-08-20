import type { BusinessSegment } from '@/lib/segmentPresets';

export type CaptureFieldType = 'text' | 'email' | 'phone' | 'textarea' | 'single_choice';

export interface CaptureFieldOption { label: string; value: string }
export interface CaptureField {
  id: string;
  key: string;
  label: string;
  type: CaptureFieldType;
  required?: boolean;
  placeholder?: string;
  options?: CaptureFieldOption[];
}

export interface CaptureFormPreset {
  id: string;
  segment: BusinessSegment;
  objective: string;
  title: string;
  description: string;
  submitLabel: string;
  fields: CaptureField[];
}

const identityFields: CaptureField[] = [
  { id: 'name', key: 'name', label: 'Seu nome', type: 'text', required: true },
  { id: 'phone', key: 'phone', label: 'WhatsApp', type: 'phone', required: true, placeholder: '(85) 99999-9999' },
  { id: 'email', key: 'email', label: 'E-mail', type: 'email' },
  { id: 'company', key: 'company', label: 'Empresa', type: 'text' },
];

export const CAPTURE_FORM_PRESETS: CaptureFormPreset[] = [
  {
    id: 'software-development',
    segment: 'b2b',
    objective: 'project_briefing',
    title: 'Conte sua ideia de projeto',
    description: 'Responda algumas perguntas para eu entender o que você quer criar e preparar o próximo passo.',
    submitLabel: 'Enviar meu projeto',
    fields: [
      {
        id: 'project_type', key: 'project_type', label: 'O que você quer criar?', type: 'single_choice', required: true,
        options: ['Site institucional', 'Landing Page', 'Sistema web', 'Plataforma SaaS', 'Aplicativo', 'Automação', 'Integração', 'IA / Chatbot', 'Ainda não sei'].map((label) => ({ label, value: label })),
      },
      {
        id: 'business_segment', key: 'business_segment', label: 'Qual é o segmento do seu negócio?', type: 'single_choice', required: true,
        options: ['Saúde', 'Educação', 'Comércio', 'Serviços', 'Alimentação', 'Imobiliário', 'Advocacia', 'Contabilidade', 'Logística', 'Tecnologia', 'Outro'].map((label) => ({ label, value: label })),
      },
      {
        id: 'audience', key: 'audience', label: 'Para quem a solução será usada?', type: 'single_choice', required: true,
        options: ['Clientes', 'Funcionários', 'Equipe comercial', 'Administração', 'Público geral', 'Outros'].map((label) => ({ label, value: label })),
      },
      { id: 'problem', key: 'problem', label: 'Qual problema você quer resolver?', type: 'textarea', required: true, placeholder: 'Descreva como funciona hoje e o que gostaria de melhorar.' },
      { id: 'current_system', key: 'current_system', label: 'Você já usa algum sistema hoje? Qual?', type: 'text' },
      {
        id: 'integration_need', key: 'integration_need', label: 'Precisa integrar com alguma ferramenta?', type: 'single_choice',
        options: ['WhatsApp', 'Suri', 'ERP', 'CRM', 'Google', 'API', 'Pagamento', 'Outro', 'Não sei'].map((label) => ({ label, value: label })),
      },
      ...identityFields,
    ],
  },
  {
    id: 'products-default', segment: 'products', objective: 'sales', title: 'Quero saber mais', description: 'Conte o que procura e nossa equipe continua o atendimento.', submitLabel: 'Enviar interesse',
    fields: [{ id: 'interest', key: 'interest', label: 'Produto ou categoria de interesse', type: 'text', required: true }, ...identityFields],
  },
  {
    id: 'services-default', segment: 'services', objective: 'quote', title: 'Solicite uma avaliação', description: 'Conte o serviço que procura e receba o próximo passo.', submitLabel: 'Solicitar contato',
    fields: [{ id: 'interest', key: 'interest', label: 'Qual serviço você procura?', type: 'text', required: true }, { id: 'need', key: 'need', label: 'Conte um pouco da sua necessidade', type: 'textarea' }, ...identityFields],
  },
  {
    id: 'real-estate-default', segment: 'real_estate', objective: 'property_interest', title: 'Encontre o imóvel ideal', description: 'Informe seu interesse para receber opções compatíveis.', submitLabel: 'Quero receber opções',
    fields: [{ id: 'interest', key: 'interest', label: 'Que tipo de imóvel procura?', type: 'text', required: true }, { id: 'region', key: 'region', label: 'Região de interesse', type: 'text' }, ...identityFields],
  },
  {
    id: 'education-default', segment: 'education', objective: 'enrollment', title: 'Quero estudar com vocês', description: 'Informe o curso de interesse e entraremos em contato.', submitLabel: 'Tenho interesse',
    fields: [{ id: 'interest', key: 'interest', label: 'Curso ou formação de interesse', type: 'text', required: true }, ...identityFields],
  },
  {
    id: 'health-default', segment: 'health_wellness', objective: 'booking', title: 'Quero atendimento', description: 'Conte o que procura para direcionarmos seu atendimento.', submitLabel: 'Solicitar atendimento',
    fields: [{ id: 'interest', key: 'interest', label: 'Procedimento ou serviço de interesse', type: 'text', required: true }, ...identityFields],
  },
  {
    id: 'hospitality-default', segment: 'hospitality', objective: 'reservation', title: 'Quero fazer uma reserva', description: 'Envie as informações iniciais e nossa equipe continua o atendimento.', submitLabel: 'Solicitar reserva',
    fields: [{ id: 'interest', key: 'interest', label: 'Tipo de reserva ou evento', type: 'text', required: true }, { id: 'date', key: 'preferred_date', label: 'Data desejada', type: 'text' }, ...identityFields],
  },
  {
    id: 'b2b-default', segment: 'b2b', objective: 'b2b_prospecting', title: 'Vamos conversar sobre sua operação', description: 'Conte o que sua empresa precisa e nossa equipe prepara o próximo passo.', submitLabel: 'Enviar briefing',
    fields: [{ id: 'interest', key: 'interest', label: 'Qual solução sua empresa procura?', type: 'text', required: true }, { id: 'need', key: 'need', label: 'Descreva o cenário atual', type: 'textarea', required: true }, ...identityFields],
  },
];

export function getCapturePresetForSegment(segment: BusinessSegment) {
  return CAPTURE_FORM_PRESETS.find((preset) => preset.segment === segment && preset.id !== 'software-development')
    ?? CAPTURE_FORM_PRESETS.find((preset) => preset.id === 'services-default')!;
}

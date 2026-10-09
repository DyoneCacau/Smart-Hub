import {
  Activity,
  Apple,
  Brain,
  Ear,
  FlaskConical,
  HeartPulse,
  Hospital,
  ScanLine,
  Smile,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

export const PROFESSIONAL_COUNCILS = [
  { value: 'CRM', label: 'CRM — Medicina' },
  { value: 'CRO', label: 'CRO — Odontologia' },
  { value: 'CRBM', label: 'CRBM — Biomedicina' },
  { value: 'CRF', label: 'CRF — Farmácia' },
  { value: 'CRBio', label: 'CRBio — Biologia' },
  { value: 'CRTR', label: 'CRTR — Técnicos em Radiologia' },
  { value: 'COREN', label: 'COREN — Enfermagem' },
  { value: 'CRP', label: 'CRP — Psicologia' },
  { value: 'CREFITO', label: 'CREFITO — Fisioterapia e T.O.' },
  { value: 'CRN', label: 'CRN — Nutrição' },
  { value: 'CRFa', label: 'CRFa — Fonoaudiologia' },
  { value: 'CREF', label: 'CREF — Educação Física' },
] as const;

export interface ServiceTemplate {
  name: string;
  category: string;
  duration_minutes: number;
  preparation?: string;
}

export type HealthSegmentId =
  | 'multidisciplinar'
  | 'clinica_medica'
  | 'odontologia'
  | 'laboratorio'
  | 'imagem'
  | 'psicologia'
  | 'fisioterapia'
  | 'nutricao'
  | 'fonoaudiologia'
  | 'estetica';

export interface HealthSegment {
  id: HealthSegmentId;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Usado em frases como "Gerencie os pacientes da clínica". */
  establishmentOf: string;
  service: { singular: string; plural: string };
  defaultCouncil: string | null;
  specialties: string[];
  categories: string[];
  templates: ServiceTemplate[];
}

const MEDICAL_SPECIALTIES = [
  'Clínica Geral',
  'Cardiologia',
  'Dermatologia',
  'Endocrinologia',
  'Gastroenterologia',
  'Ginecologia e Obstetrícia',
  'Neurologia',
  'Oftalmologia',
  'Ortopedia',
  'Otorrinolaringologia',
  'Pediatria',
  'Psiquiatria',
  'Urologia',
];

const DENTAL_SPECIALTIES = [
  'Clínico Geral',
  'Ortodontia',
  'Endodontia',
  'Periodontia',
  'Implantodontia',
  'Odontopediatria',
  'Cirurgia Bucomaxilofacial',
  'Prótese Dentária',
  'Dentística',
  'Harmonização Orofacial',
  'Radiologia Odontológica',
];

const LAB_SPECIALTIES = ['Análises Clínicas', 'Biomedicina', 'Bioquímica', 'Patologia Clínica', 'Técnico de coleta'];

const IMAGING_SPECIALTIES = [
  'Radiologia e Diagnóstico por Imagem',
  'Ultrassonografia',
  'Tomografia',
  'Ressonância Magnética',
  'Mamografia',
  'Densitometria',
  'Técnico em Radiologia',
];

const PSYCHOLOGY_SPECIALTIES = [
  'Psicologia Clínica',
  'Neuropsicologia',
  'Psicologia Infantil',
  'Terapia Cognitivo-Comportamental',
  'Psicanálise',
  'Psiquiatria',
];

const PHYSIO_SPECIALTIES = [
  'Fisioterapia Ortopédica',
  'Fisioterapia Neurológica',
  'Fisioterapia Respiratória',
  'Fisioterapia Desportiva',
  'Pilates',
  'RPG',
  'Terapia Ocupacional',
];

const NUTRITION_SPECIALTIES = [
  'Nutrição Clínica',
  'Nutrição Esportiva',
  'Nutrição Materno-Infantil',
  'Nutrição Comportamental',
];

const SPEECH_SPECIALTIES = ['Fonoaudiologia Clínica', 'Audiologia', 'Linguagem', 'Motricidade Orofacial', 'Voz'];

const AESTHETIC_SPECIALTIES = [
  'Biomedicina Estética',
  'Dermatologia',
  'Harmonização Orofacial',
  'Estética e Cosmetologia',
  'Enfermagem Estética',
];

export const HEALTH_SEGMENTS: HealthSegment[] = [
  {
    id: 'multidisciplinar',
    label: 'Clínica multidisciplinar',
    description: 'Várias especialidades no mesmo lugar',
    icon: Hospital,
    establishmentOf: 'da clínica',
    service: { singular: 'Procedimento', plural: 'Procedimentos' },
    defaultCouncil: null,
    specialties: Array.from(
      new Set([
        ...MEDICAL_SPECIALTIES,
        ...DENTAL_SPECIALTIES,
        ...PSYCHOLOGY_SPECIALTIES,
        ...PHYSIO_SPECIALTIES,
        ...NUTRITION_SPECIALTIES,
        ...SPEECH_SPECIALTIES,
      ]),
    ).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    categories: ['Consulta', 'Retorno', 'Exame', 'Terapia', 'Procedimento'],
    templates: [
      { name: 'Consulta', category: 'Consulta', duration_minutes: 30 },
      { name: 'Retorno', category: 'Retorno', duration_minutes: 20 },
      { name: 'Avaliação', category: 'Consulta', duration_minutes: 45 },
      { name: 'Teleconsulta', category: 'Consulta', duration_minutes: 30 },
    ],
  },
  {
    id: 'clinica_medica',
    label: 'Clínica médica / consultório',
    description: 'Consultas, retornos e pequenos procedimentos',
    icon: HeartPulse,
    establishmentOf: 'da clínica',
    service: { singular: 'Procedimento', plural: 'Procedimentos' },
    defaultCouncil: 'CRM',
    specialties: MEDICAL_SPECIALTIES,
    categories: ['Consulta', 'Retorno', 'Exame', 'Procedimento'],
    templates: [
      { name: 'Consulta', category: 'Consulta', duration_minutes: 30 },
      { name: 'Retorno', category: 'Retorno', duration_minutes: 20 },
      { name: 'Teleconsulta', category: 'Consulta', duration_minutes: 30 },
      { name: 'Eletrocardiograma', category: 'Exame', duration_minutes: 20 },
      { name: 'Pequeno procedimento ambulatorial', category: 'Procedimento', duration_minutes: 45 },
    ],
  },
  {
    id: 'odontologia',
    label: 'Odontologia',
    description: 'Consultório ou clínica odontológica',
    icon: Smile,
    establishmentOf: 'da clínica',
    service: { singular: 'Procedimento', plural: 'Procedimentos' },
    defaultCouncil: 'CRO',
    specialties: DENTAL_SPECIALTIES,
    categories: ['Avaliação', 'Prevenção', 'Dentística', 'Endodontia', 'Cirurgia', 'Ortodontia', 'Estética'],
    templates: [
      { name: 'Avaliação odontológica', category: 'Avaliação', duration_minutes: 30 },
      { name: 'Limpeza (profilaxia)', category: 'Prevenção', duration_minutes: 40 },
      { name: 'Restauração', category: 'Dentística', duration_minutes: 60 },
      { name: 'Tratamento de canal', category: 'Endodontia', duration_minutes: 90 },
      { name: 'Extração', category: 'Cirurgia', duration_minutes: 60 },
      { name: 'Manutenção ortodôntica', category: 'Ortodontia', duration_minutes: 30 },
      { name: 'Clareamento', category: 'Estética', duration_minutes: 60 },
    ],
  },
  {
    id: 'laboratorio',
    label: 'Laboratório de análises clínicas',
    description: 'Coleta de exames com orientação de preparo',
    icon: FlaskConical,
    establishmentOf: 'do laboratório',
    service: { singular: 'Exame', plural: 'Exames' },
    defaultCouncil: 'CRBM',
    specialties: LAB_SPECIALTIES,
    categories: ['Hematologia', 'Bioquímica', 'Hormônios', 'Imunologia', 'Urinálise', 'Microbiologia', 'Coleta domiciliar'],
    templates: [
      { name: 'Hemograma completo', category: 'Hematologia', duration_minutes: 10, preparation: 'Não é necessário jejum.' },
      { name: 'Glicemia de jejum', category: 'Bioquímica', duration_minutes: 10, preparation: 'Jejum de 8 horas (água liberada).' },
      {
        name: 'Perfil lipídico',
        category: 'Bioquímica',
        duration_minutes: 10,
        preparation: 'Jejum não obrigatório, salvo orientação médica.',
      },
      { name: 'TSH e T4 livre', category: 'Hormônios', duration_minutes: 10 },
      {
        name: 'Urina tipo 1 (EAS)',
        category: 'Urinálise',
        duration_minutes: 10,
        preparation: 'Colher a primeira urina da manhã, desprezando o primeiro jato.',
      },
      { name: 'Coleta domiciliar', category: 'Coleta domiciliar', duration_minutes: 30 },
    ],
  },
  {
    id: 'imagem',
    label: 'Diagnóstico por imagem',
    description: 'Raio-X, ultrassom, tomografia e afins',
    icon: ScanLine,
    establishmentOf: 'da clínica',
    service: { singular: 'Exame', plural: 'Exames' },
    defaultCouncil: 'CRM',
    specialties: IMAGING_SPECIALTIES,
    categories: ['Raio-X', 'Ultrassom', 'Tomografia', 'Ressonância', 'Mamografia', 'Densitometria'],
    templates: [
      { name: 'Raio-X de tórax', category: 'Raio-X', duration_minutes: 15 },
      { name: 'Ultrassom de abdome total', category: 'Ultrassom', duration_minutes: 30, preparation: 'Jejum de 8 horas.' },
      {
        name: 'Ultrassom pélvico',
        category: 'Ultrassom',
        duration_minutes: 30,
        preparation: 'Bexiga cheia: beber cerca de 1 litro de água 1 hora antes e não urinar.',
      },
      {
        name: 'Mamografia',
        category: 'Mamografia',
        duration_minutes: 20,
        preparation: 'Não usar desodorante, talco ou creme nas mamas e axilas no dia do exame.',
      },
      {
        name: 'Tomografia computadorizada',
        category: 'Tomografia',
        duration_minutes: 30,
        preparation: 'Trazer exames anteriores. Se houver contraste, seguir a orientação de jejum recebida.',
      },
    ],
  },
  {
    id: 'psicologia',
    label: 'Psicologia / saúde mental',
    description: 'Sessões presenciais e online',
    icon: Brain,
    establishmentOf: 'do consultório',
    service: { singular: 'Serviço', plural: 'Serviços' },
    defaultCouncil: 'CRP',
    specialties: PSYCHOLOGY_SPECIALTIES,
    categories: ['Psicoterapia', 'Avaliação', 'Online'],
    templates: [
      { name: 'Sessão individual', category: 'Psicoterapia', duration_minutes: 50 },
      { name: 'Sessão online', category: 'Online', duration_minutes: 50 },
      { name: 'Terapia de casal', category: 'Psicoterapia', duration_minutes: 60 },
      { name: 'Avaliação psicológica', category: 'Avaliação', duration_minutes: 60 },
    ],
  },
  {
    id: 'fisioterapia',
    label: 'Fisioterapia / reabilitação',
    description: 'Avaliações, sessões e pacotes',
    icon: Activity,
    establishmentOf: 'da clínica',
    service: { singular: 'Serviço', plural: 'Serviços' },
    defaultCouncil: 'CREFITO',
    specialties: PHYSIO_SPECIALTIES,
    categories: ['Avaliação', 'Sessão', 'Pilates', 'Terapia manual'],
    templates: [
      { name: 'Avaliação fisioterapêutica', category: 'Avaliação', duration_minutes: 60 },
      { name: 'Sessão de fisioterapia', category: 'Sessão', duration_minutes: 50 },
      { name: 'Pilates', category: 'Pilates', duration_minutes: 50 },
      { name: 'RPG', category: 'Sessão', duration_minutes: 50 },
      { name: 'Drenagem linfática', category: 'Terapia manual', duration_minutes: 60 },
    ],
  },
  {
    id: 'nutricao',
    label: 'Nutrição',
    description: 'Consultas, retornos e avaliação corporal',
    icon: Apple,
    establishmentOf: 'do consultório',
    service: { singular: 'Serviço', plural: 'Serviços' },
    defaultCouncil: 'CRN',
    specialties: NUTRITION_SPECIALTIES,
    categories: ['Consulta', 'Retorno', 'Avaliação', 'Online'],
    templates: [
      { name: 'Consulta nutricional', category: 'Consulta', duration_minutes: 60 },
      { name: 'Retorno', category: 'Retorno', duration_minutes: 30 },
      {
        name: 'Bioimpedância',
        category: 'Avaliação',
        duration_minutes: 20,
        preparation: 'Evitar exercícios intensos e cafeína nas horas anteriores; seguir a orientação recebida.',
      },
      { name: 'Consulta online', category: 'Online', duration_minutes: 45 },
    ],
  },
  {
    id: 'fonoaudiologia',
    label: 'Fonoaudiologia',
    description: 'Terapias e exames audiológicos',
    icon: Ear,
    establishmentOf: 'do consultório',
    service: { singular: 'Serviço', plural: 'Serviços' },
    defaultCouncil: 'CRFa',
    specialties: SPEECH_SPECIALTIES,
    categories: ['Avaliação', 'Terapia', 'Exame'],
    templates: [
      { name: 'Avaliação fonoaudiológica', category: 'Avaliação', duration_minutes: 60 },
      { name: 'Sessão de terapia', category: 'Terapia', duration_minutes: 45 },
      {
        name: 'Audiometria',
        category: 'Exame',
        duration_minutes: 30,
        preparation: 'Repouso auditivo de 14 horas (evitar ruído intenso).',
      },
    ],
  },
  {
    id: 'estetica',
    label: 'Estética e harmonização',
    description: 'Procedimentos estéticos faciais e corporais',
    icon: Sparkles,
    establishmentOf: 'da clínica',
    service: { singular: 'Procedimento', plural: 'Procedimentos' },
    defaultCouncil: null,
    specialties: AESTHETIC_SPECIALTIES,
    categories: ['Avaliação', 'Facial', 'Corporal', 'Injetáveis'],
    templates: [
      { name: 'Avaliação estética', category: 'Avaliação', duration_minutes: 30 },
      { name: 'Toxina botulínica', category: 'Injetáveis', duration_minutes: 45 },
      { name: 'Preenchimento', category: 'Injetáveis', duration_minutes: 60 },
      { name: 'Limpeza de pele', category: 'Facial', duration_minutes: 60 },
      { name: 'Peeling', category: 'Facial', duration_minutes: 45 },
    ],
  },
];

export const DEFAULT_SEGMENT_ID: HealthSegmentId = 'multidisciplinar';

export function getHealthSegment(id: string | null | undefined): HealthSegment {
  return HEALTH_SEGMENTS.find((s) => s.id === id) ?? HEALTH_SEGMENTS[0];
}

// Funções do sistema (roles) e labels para a aba Permissões
export const SYSTEM_ROLES = ['admin', 'receptionist', 'seller', 'professional'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const ROLE_LABELS: Record<SystemRole, string> = {
  admin: 'Administrador',
  receptionist: 'Recepcionista',
  seller: 'Vendedor',
  professional: 'Profissional',
};

// Módulos/telas do sistema que podem ter permissão granular
export const PERMISSION_FEATURES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'agenda_todas_clinicas', label: 'Agenda - todas as clínicas' },
  { id: 'pacientes', label: 'Pacientes' },
  { id: 'profissionais', label: 'Profissionais' },
  { id: 'financeiro', label: 'Caixa' },
  { id: 'contas_receber', label: 'Contas a receber' },
  { id: 'comissoes', label: 'Comissões' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'estoque_liberar', label: 'Liberar estoque sem saldo' },
  { id: 'procedimentos', label: 'Procedimentos' },
  { id: 'crm', label: 'CRM de Vendas' },
  { id: 'atendimento', label: 'Atendimento' },
  { id: 'integracoes', label: 'Integrações' },
  { id: 'smart_hub', label: 'Smart Hub' },
  { id: 'marketing_crm', label: 'Marketing CRM' },
  { id: 'marketing_campanhas', label: 'Campanhas' },
  { id: 'marketing_landing_pages', label: 'Landing Pages' },
  { id: 'marketing_analytics', label: 'Analytics Marketing' },
  { id: 'relatorios', label: 'Relatórios' },
  { id: 'ponto', label: 'Ponto' },
  { id: 'termos', label: 'Termos' },
  { id: 'administracao', label: 'Administração' },
  { id: 'configuracoes', label: 'Configurações' },
] as const;

export type PermissionFeatureId = (typeof PERMISSION_FEATURES)[number]['id'];

// Ações que podem ser permitidas ou negadas por tela
export const PERMISSION_ACTIONS = [
  { id: 'can_view', label: 'Ver', key: 'can_view' as const },
  { id: 'can_create', label: 'Criar', key: 'can_create' as const },
  { id: 'can_edit', label: 'Editar', key: 'can_edit' as const },
  { id: 'can_delete', label: 'Excluir', key: 'can_delete' as const },
] as const;

export type ActionKey = 'can_view' | 'can_create' | 'can_edit' | 'can_delete';

/** Subcategoria: uma linha da tabela com feature + ações exibidas */
export interface PermissionChildRow {
  feature: string;
  label: string;
  actions: ActionKey[];
}

/** Grupo expansível: módulo principal com seta e subopções */
export interface PermissionGroup {
  id: string;
  label: string;
  children: PermissionChildRow[];
}

/** Estrutura hierárquica para a aba Permissões (categoria com seta para expandir) */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'gr_agenda',
    label: 'Agenda',
    children: [
      { feature: 'agenda', label: 'Acessar agenda', actions: ['can_view'] },
      { feature: 'agenda_todas_clinicas', label: 'Ver outras unidades do mesmo admin', actions: ['can_view'] },
      { feature: 'agenda', label: 'Criar agendamento', actions: ['can_create'] },
      { feature: 'agenda', label: 'Editar / Mudar status', actions: ['can_edit'] },
      { feature: 'agenda', label: 'Deletar registro', actions: ['can_delete'] },
    ],
  },
  {
    id: 'gr_financeiro',
    label: 'Caixa',
    children: [
      { feature: 'financeiro', label: 'Acessar caixa do dia', actions: ['can_view'] },
      { feature: 'financeiro', label: 'Incluir e retirar', actions: ['can_create'] },
      { feature: 'financeiro', label: 'Editar e estorno', actions: ['can_edit'] },
      { feature: 'financeiro', label: 'Apagar registro', actions: ['can_delete'] },
    ],
  },
  {
    id: 'gr_contas_receber',
    label: 'Contas a receber',
    children: [
      { feature: 'contas_receber', label: 'Ver contas', actions: ['can_view'] },
      { feature: 'contas_receber', label: 'Criar lançamento', actions: ['can_create'] },
      { feature: 'contas_receber', label: 'Dar baixa / editar', actions: ['can_edit'] },
      { feature: 'contas_receber', label: 'Cancelar', actions: ['can_delete'] },
    ],
  },
  {
    id: 'gr_pacientes',
    label: 'Pacientes',
    children: [
      { feature: 'pacientes', label: 'Ver', actions: ['can_view'] },
      { feature: 'pacientes', label: 'Criar', actions: ['can_create'] },
      { feature: 'pacientes', label: 'Editar', actions: ['can_edit'] },
      { feature: 'pacientes', label: 'Excluir', actions: ['can_delete'] },
    ],
  },
  {
    id: 'gr_profissionais',
    label: 'Profissionais',
    children: [
      { feature: 'profissionais', label: 'Ver', actions: ['can_view'] },
      { feature: 'profissionais', label: 'Criar', actions: ['can_create'] },
      { feature: 'profissionais', label: 'Editar', actions: ['can_edit'] },
      { feature: 'profissionais', label: 'Excluir', actions: ['can_delete'] },
    ],
  },
  {
    id: 'gr_comissoes',
    label: 'Comissões',
    children: [
      { feature: 'comissoes', label: 'Ver', actions: ['can_view'] },
      { feature: 'comissoes', label: 'Criar / Editar', actions: ['can_create', 'can_edit'] },
      { feature: 'comissoes', label: 'Excluir', actions: ['can_delete'] },
    ],
  },
  {
    id: 'gr_estoque',
    label: 'Estoque',
    children: [
      { feature: 'estoque', label: 'Ver', actions: ['can_view'] },
      { feature: 'estoque', label: 'Criar / Editar', actions: ['can_create', 'can_edit'] },
      { feature: 'estoque', label: 'Excluir', actions: ['can_delete'] },
      { feature: 'estoque_liberar', label: 'Liberar finalização sem saldo', actions: ['can_edit'] },
    ],
  },
  {
    id: 'gr_procedimentos',
    label: 'Procedimentos',
    children: [
      { feature: 'procedimentos', label: 'Ver catálogo', actions: ['can_view'] },
      { feature: 'procedimentos', label: 'Criar', actions: ['can_create'] },
      { feature: 'procedimentos', label: 'Editar', actions: ['can_edit'] },
      { feature: 'procedimentos', label: 'Excluir', actions: ['can_delete'] },
    ],
  },
  {
    id: 'gr_crm',
    label: 'CRM de Vendas',
    children: [
      { feature: 'crm', label: 'Ver pipeline', actions: ['can_view'] },
      { feature: 'crm', label: 'Criar lead', actions: ['can_create'] },
      { feature: 'crm', label: 'Editar / mover etapa', actions: ['can_edit'] },
      { feature: 'crm', label: 'Excluir lead', actions: ['can_delete'] },
    ],
  },
  {
    id: 'gr_atendimento',
    label: 'Atendimento',
    children: [
      { feature: 'atendimento', label: 'Ver inbox', actions: ['can_view'] },
      { feature: 'atendimento', label: 'Responder conversas', actions: ['can_create', 'can_edit'] },
      { feature: 'atendimento', label: 'Configurar canais e fluxos', actions: ['can_edit', 'can_delete'] },
    ],
  },
  {
    id: 'gr_integracoes',
    label: 'Integrações',
    children: [
      { feature: 'integracoes', label: 'Ver conexões e logs', actions: ['can_view'] },
      { feature: 'integracoes', label: 'Criar conexão / token', actions: ['can_create'] },
      { feature: 'integracoes', label: 'Editar conexão e fluxos', actions: ['can_edit'] },
      { feature: 'integracoes', label: 'Remover conexão / revogar token', actions: ['can_delete'] },
    ],
  },
  {
    id: 'gr_marketing',
    label: 'Marketing',
    children: [
      { feature: 'marketing_crm', label: 'CRM Marketing', actions: ['can_view', 'can_create', 'can_edit', 'can_delete'] },
      { feature: 'marketing_campanhas', label: 'Campanhas', actions: ['can_view', 'can_create', 'can_edit', 'can_delete'] },
      { feature: 'marketing_landing_pages', label: 'Landing Pages', actions: ['can_view', 'can_create', 'can_edit', 'can_delete'] },
      { feature: 'smart_hub', label: 'Smart Hub — ver', actions: ['can_view'] },
      { feature: 'smart_hub', label: 'Smart Hub — editar', actions: ['can_create', 'can_edit'] },
      { feature: 'smart_hub', label: 'Smart Hub — excluir', actions: ['can_delete'] },
      { feature: 'marketing_analytics', label: 'Analytics', actions: ['can_view'] },
    ],
  },
  {
    id: 'gr_relatorios',
    label: 'Relatórios',
    children: [{ feature: 'relatorios', label: 'Ver', actions: ['can_view'] }],
  },
  {
    id: 'gr_ponto',
    label: 'Ponto',
    children: [
      { feature: 'ponto', label: 'Ver', actions: ['can_view'] },
      { feature: 'ponto', label: 'Criar / Editar', actions: ['can_create', 'can_edit'] },
    ],
  },
  {
    id: 'gr_termos',
    label: 'Termos',
    children: [
      { feature: 'termos', label: 'Ver', actions: ['can_view'] },
      { feature: 'termos', label: 'Criar / Editar', actions: ['can_create', 'can_edit'] },
      { feature: 'termos', label: 'Excluir', actions: ['can_delete'] },
    ],
  },
  {
    id: 'gr_dashboard',
    label: 'Dashboard',
    children: [{ feature: 'dashboard', label: 'Acesso', actions: ['can_view'] }],
  },
  {
    id: 'gr_administracao',
    label: 'Administração',
    children: [
      { feature: 'administracao', label: 'Ver', actions: ['can_view'] },
      { feature: 'administracao', label: 'Criar / Editar / Excluir', actions: ['can_create', 'can_edit', 'can_delete'] },
    ],
  },
  {
    id: 'gr_configuracoes',
    label: 'Configurações',
    children: [{ feature: 'configuracoes', label: 'Acesso', actions: ['can_view', 'can_edit'] }],
  },
];

/** Lista única de feature ids usados nos grupos (para save/load) */
export function getAllPermissionFeatureIds(): string[] {
  const fromGroups = PERMISSION_GROUPS.flatMap((g) => g.children.map((c) => c.feature));
  const fromFeatures = PERMISSION_FEATURES.map((f) => f.id);
  return [...new Set([...fromGroups, ...fromFeatures])];
}

export type PermissionRow = {
  feature: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

// Valores padrão: admin tudo; recepcionista agenda+pacientes; vendedor comissões; profissional agenda+pacientes
export function getDefaultPermissionsForRole(role: SystemRole): PermissionRow[] {
  const allTrue = PERMISSION_FEATURES.map((f) => ({
    feature: f.id,
    can_view: true,
    can_create: true,
    can_edit: true,
    can_delete: true,
  }));

  if (role === 'admin') return allTrue;

  const base = PERMISSION_FEATURES.map((f) => ({
    feature: f.id,
    can_view: ['agenda', 'pacientes', 'atendimento', 'dashboard', 'configuracoes'].includes(f.id),
    can_create: false,
    can_edit: false,
    can_delete: false,
  }));

  if (role === 'receptionist') {
    return base.map((p) => {
      if (p.feature === 'estoque_liberar') {
        return { ...p, can_view: true, can_create: false, can_edit: true, can_delete: false };
      }
      if (['agenda', 'pacientes', 'atendimento', 'dashboard', 'configuracoes', 'financeiro', 'crm'].includes(p.feature)) {
        return { ...p, can_view: true, can_create: true, can_edit: true, can_delete: false };
      }
      return p;
    });
  }
  if (role === 'seller') {
    return base.map((p) =>
      ['comissoes', 'dashboard', 'configuracoes', 'pacientes', 'crm'].includes(p.feature)
        ? {
            ...p,
            can_view: true,
            can_create: p.feature === 'comissoes' || p.feature === 'crm',
            can_edit: true,
            can_delete: false,
          }
        : p
    );
  }
  if (role === 'professional') {
    return base.map((p) =>
      ['agenda', 'pacientes', 'dashboard', 'configuracoes', 'ponto'].includes(p.feature)
        ? { ...p, can_view: true, can_create: true, can_edit: true, can_delete: false }
        : p
    );
  }
  return base;
}

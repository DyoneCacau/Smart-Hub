import type {
  SmartHubClickAction,
  SmartHubButtonVisualVariant,
  SmartHubButtonType,
} from '@/types/smartHub';

export const BUTTON_FIELD_HELP = {
  title: 'Nome que aparece no botão da página pública.',
  subtitle: 'Texto de apoio opcional, abaixo do título.',
  info_content: 'Texto explicativo mostrado ao visitante sem sair da página.',
  intent:
    'Escolha o resultado que o visitante terá ao tocar neste botão. O sistema configura o tipo e a ação automaticamente.',
  intent_social: 'Selecione a rede social que será aberta.',
  intent_contact_method:
    'Defina como o pedido de agendamento ou contato será recebido pela clínica.',
  advanced_type:
    'Configurações técnicas definidas automaticamente. Altere somente quando houver uma necessidade específica.',
  type: 'Define o que este botão representa, como WhatsApp, Instagram, agendamento, procedimentos ou informação.',
  type_tooltip:
    'O tipo define a finalidade visual do botão e ajuda o sistema a sugerir ícone, ação e campos adequados.',
  type_internal: 'Abre uma página ou seção dentro do próprio Smart Hub.',
  click_action: 'Escolha o que acontece quando o visitante tocar neste botão.',
  action_suggested: 'Ação sugerida com base no tipo selecionado.',
  action_custom: 'Permite escolher qualquer ação, mesmo fora das recomendações do tipo.',
  capture_interest: 'Ajuda a identificar no CRM o assunto ou interesse do lead.',
  capture_stage: 'Etapa do funil em que o lead entra após o formulário.',
  capture_owner: 'Pessoa da clínica que receberá este lead.',
  capture_redirect_wa: 'Após o envio, o visitante pode ser enviado ao WhatsApp.',
  capture_wa_phone: 'Número usado no redirecionamento após o formulário.',
  capture_wa_message: 'Mensagem pronta na conversa do WhatsApp após o envio.',
  capture_use_hub_defaults:
    'Utiliza os campos, responsável e etapa definidos nas Configurações do Smart Hub.',
  capture_customize_button:
    'Ative para utilizar campos, responsável, etapa ou mensagem diferentes somente neste botão.',
  title_form_appointment:
    "Para formulários de contato, recomendamos 'Solicitar agendamento', pois o horário ainda será confirmado pela equipe.",
  url: 'Endereço que será aberto (site, mapa, link externo…).',
  phone: 'Número com DDD (ex.: 5511999999999).',
  email: 'Endereço de e-mail que será aberto no aplicativo do visitante.',
  email_subject: 'Assunto sugerido no e-mail (opcional).',
  map_url: 'Link do Google Maps ou endereço da clínica.',
  whatsapp_message: 'Mensagem que já aparece pronta quando o WhatsApp abre.',
  open_in_new_tab: 'Se ativo, o destino abre em outra aba do navegador.',
  visual_variant: 'Escolha como este botão aparecerá na página pública.',
  icon: 'Nome do ícone opcional para reforçar a ação do botão.',
  image: 'Imagem exibida no card. Ideal para procedimentos e campanhas.',
  image_alt: 'Descrição da imagem para acessibilidade.',
  background_color: 'Cor de fundo do botão na página pública.',
  text_color: 'Cor do texto do botão.',
  visible: 'Se desativado, o botão não aparece na página pública.',
  track_click: 'Registra quantas pessoas clicaram neste botão.',
  order_index: 'Ordem na página (números menores aparecem primeiro).',
} as const;

export const APPOINTMENT_FORM_HOW_IT_WORKS =
  'O visitante preencherá os dados e será criado ou atualizado como lead no CRM. A equipe da clínica deverá entrar em contato para escolher e confirmar o horário. Nenhum horário será reservado automaticamente.';


export const CLICK_ACTION_HELP: Record<
  SmartHubClickAction,
  { description: string; badge?: string }
> = {
  auto: {
    description: 'Usa o comportamento padrão conforme o tipo escolhido.',
  },
  form: {
    description:
      'Abre um formulário para o visitante preencher os dados. O lead pode entrar no CRM automaticamente.',
    badge: 'Recomendado para gerar leads no CRM',
  },
  whatsapp: {
    description: 'Leva o visitante direto para a conversa no WhatsApp.',
    badge: 'Ideal para atendimento rápido',
  },
  link: {
    description: 'Abre outro site, página ou landing page.',
  },
  phone: {
    description: 'Inicia uma chamada telefônica para o número informado.',
  },
  email: {
    description: 'Abre o aplicativo de e-mail do visitante.',
  },
  map: {
    description: 'Abre o endereço da clínica no mapa.',
  },
  info: {
    description: 'Mostra uma informação ao visitante sem sair da página.',
  },
  booking: {
    description:
      'Abre o wizard de agendamento online para o visitante escolher horário e confirmar.',
    badge: 'Agenda automática',
  },
};

export const VARIANT_HELP: Record<
  SmartHubButtonVisualVariant,
  { description: string; badge: string }
> = {
  simple: {
    description:
      'Formato tradicional e compacto. Indicado para ações secundárias ou páginas com muitos links.',
    badge: 'Mais usado',
  },
  icon_card: {
    description:
      'Usa um ícone para facilitar a identificação. Ideal para WhatsApp, telefone, localização e redes sociais.',
    badge: 'Ideal para contatos',
  },
  image_card: {
    description:
      'Exibe uma imagem junto ao texto. Recomendado para procedimentos, tratamentos, serviços ou campanhas.',
    badge: 'Ideal para procedimentos',
  },
  horizontal_card: {
    description:
      'Combina imagem, título e subtítulo em uma faixa horizontal. Ideal quando a imagem faz parte da comunicação.',
    badge: 'Bom com imagem',
  },
  featured_card: {
    description:
      'Formato mais chamativo. Recomendado para a principal ação da página, como agendar uma avaliação.',
    badge: 'Recomendado para CTA principal',
  },
  list_item: {
    description: 'Formato compacto para organizar várias opções em sequência.',
    badge: 'Compacto',
  },
  grid: {
    description:
      'Organiza vários serviços lado a lado. Indicado quando as opções possuem importância semelhante.',
    badge: 'Bom para vários serviços',
  },
};

export const OWNER_OPTION_HINTS = {
  none: 'O lead ficará disponível para a equipe.',
  user: 'O lead será atribuído automaticamente a este usuário.',
} as const;

export function ownerFieldGuidance(opts: {
  ownerName: string | null;
}): { primary: string; secondary: string } {
  if (!opts.ownerName) {
    return {
      primary:
        'O lead entrará na etapa Novo sem um responsável definido. Qualquer usuário autorizado da equipe poderá assumir o atendimento.',
      secondary:
        'Para evitar contatos esquecidos, confirme se sua equipe recebe notificações de novos leads sem responsável.',
    };
  }
  return {
    primary: `O lead será atribuído automaticamente a ${opts.ownerName} assim que o formulário for enviado.`,
    secondary:
      'Use esta opção quando essa pessoa for responsável por acompanhar os contatos recebidos pelo Smart Hub.',
  };
}

export function recommendVariantForButton(opts: {
  type: SmartHubButtonType;
  action: SmartHubClickAction;
  hasImage: boolean;
  title: string;
  interest?: string | null;
}): string {
  const { type, action, hasImage, interest } = opts;
  const interestHint = interest?.trim()
    ? ` como ${interest.trim()}`
    : ' como Facetas, Harmonização ou Clareamento';

  if (type === 'procedure' || (interest && interest.trim())) {
    if (hasImage) {
      return 'Card horizontal ou Card com imagem destacam melhor o procedimento.';
    }
    return `Card com imagem é uma boa opção para apresentar tratamentos${interestHint}.`;
  }

  if (action === 'form' || type === 'appointment' || type === 'form') {
    if (hasImage) {
      return 'Card horizontal ou Card com imagem destacam melhor o procedimento.';
    }
    return 'Recomendamos Card destacado quando esta for a principal ação da página.';
  }

  if (action === 'whatsapp' || type === 'whatsapp' || type === 'phone' || type === 'map') {
    return 'Card com ícone ou Botão simples deixam o contato rápido e fácil de identificar.';
  }

  if (
    type === 'instagram' ||
    type === 'facebook' ||
    type === 'tiktok' ||
    type === 'youtube' ||
    type === 'social'
  ) {
    return 'Card com ícone ou Botão simples deixam o contato rápido e fácil de identificar.';
  }

  if (hasImage) {
    return 'Card horizontal ou Card com imagem destacam melhor o procedimento.';
  }

  if (action === 'link' || type === 'link' || type === 'site') {
    return 'Use Grid para organizar as opções de forma equilibrada.';
  }

  return 'Botão simples funciona bem para a maioria das ações secundárias.';
}

export function previewBehaviorTitle(): string {
  return 'Comportamento';
}

export function previewIntentTitle(): string {
  return 'Este botão irá';
}

export function previewAttendanceTitle(): string {
  return 'Atendimento';
}

/** Linhas do resumo lateral (evita ambiguidade com agendamento automático). */
export function previewBehaviorLines(
  action: SmartHubClickAction,
  opts?: {
    redirectWhatsapp?: boolean;
    stageLabel?: string;
    ownerName?: string | null;
    contactMethod?: 'form' | 'whatsapp' | 'link' | 'online_booking' | null;
    isAppointmentFlow?: boolean;
  }
): string[] {
  switch (action) {
    case 'form': {
      const lines = [
        'Abre um formulário de solicitação.',
        'Cria ou atualiza o lead no CRM.',
        opts?.isAppointmentFlow
          ? 'A equipe confirma o horário.'
          : 'A equipe da clínica entra em contato.',
        'Não reserva horário automaticamente.',
      ];
      if (opts?.redirectWhatsapp) {
        lines.push('Depois do envio, o WhatsApp pode ser aberto.');
      }
      return lines;
    }
    case 'whatsapp':
      return [
        'Abre a conversa no WhatsApp.',
        'Nenhum lead é criado automaticamente.',
      ];
    case 'link':
      return opts?.isAppointmentFlow
        ? [
            'Abre o link de agenda externa informado.',
            'O agendamento ocorre fora do Healthcare.',
          ]
        : ['O visitante será levado para outro site.'];
    case 'phone':
      return ['O visitante poderá iniciar uma ligação para o número informado.'];
    case 'email':
      return ['O aplicativo de e-mail do visitante será aberto.'];
    case 'map':
      return ['O mapa ou endereço da clínica será aberto.'];
    case 'info':
      return ['A informação será exibida na própria página, sem redirecionar.'];
    case 'booking':
      return [
        'Abre o wizard de agendamento online.',
        'O visitante escolhe procedimento, profissional, data e horário.',
        'Confirma e reserva o horário na agenda da clínica.',
      ];
    default:
      return ['O comportamento segue o tipo escolhido para este botão.'];
  }
}

/** Texto único da prévia lateral (compatível com usos legados). */
export function previewBehaviorDescription(
  action: SmartHubClickAction,
  opts?: {
    redirectWhatsapp?: boolean;
    stageLabel?: string;
    ownerName?: string | null;
    contactMethod?: 'form' | 'whatsapp' | 'link' | 'online_booking' | null;
    isAppointmentFlow?: boolean;
  }
): string {
  return previewBehaviorLines(action, opts).join(' ');
}

export function formFlowSteps(redirectWhatsapp: boolean): string[] {
  const steps = [
    'cria ou atualiza o lead',
    'registra o interesse',
    'a equipe entra em contato',
  ];
  if (redirectWhatsapp) {
    steps.push('o visitante pode ser direcionado ao WhatsApp');
  }
  return steps;
}

/**
 * Resumo curto do rodapé do modal (máx. ~2–3 linhas).
 * Não repete labels/descrições longas do formulário.
 */
export function buttonEditorShortSummary(opts: {
  action: SmartHubClickAction;
  isAppointmentFlow?: boolean;
  redirectWhatsapp?: boolean;
}): string {
  switch (opts.action) {
    case 'form':
      return opts.redirectWhatsapp
        ? 'Este botão abrirá um formulário, registrará o contato no CRM e poderá abrir o WhatsApp após o envio.'
        : 'Este botão abrirá um formulário e registrará o contato no CRM.';
    case 'whatsapp':
      return 'Este botão abrirá uma conversa no WhatsApp.';
    case 'booking':
      return 'Este botão abrirá o agendamento online na própria página.';
    case 'link':
      return opts.isAppointmentFlow
        ? 'Este botão abrirá o link de agenda externa informado.'
        : 'Este botão abrirá um site ou link externo.';
    case 'phone':
      return 'Este botão iniciará uma ligação para o número informado.';
    case 'email':
      return 'Este botão abrirá o aplicativo de e-mail do visitante.';
    case 'map':
      return 'Este botão abrirá o mapa ou endereço da clínica.';
    case 'info':
      return 'Este botão mostrará uma informação na própria página.';
    default:
      return 'O comportamento segue a configuração deste botão.';
  }
}

import type {
  SmartHubCaptureConfig,
  SmartHubClickAction,
  SmartHubFormFieldConfig,
} from '@/types/smartHub';

export const DEFAULT_CAPTURE_FIELDS: SmartHubFormFieldConfig[] = [
  {
    key: 'name',
    visible: true,
    required: true,
    label: 'Nome',
    placeholder: 'Seu nome completo',
    order: 1,
  },
  {
    key: 'whatsapp',
    visible: true,
    required: true,
    label: 'WhatsApp',
    placeholder: '(11) 99999-9999',
    order: 2,
  },
  {
    key: 'email',
    visible: true,
    required: false,
    label: 'E-mail',
    placeholder: 'seu@email.com',
    order: 3,
  },
  {
    key: 'interest',
    visible: true,
    required: false,
    label: 'Serviço de interesse',
    placeholder: 'Ex.: Avaliação, Clareamento…',
    order: 4,
  },
  {
    key: 'message',
    visible: true,
    required: false,
    label: 'Mensagem',
    placeholder: 'Como podemos ajudar?',
    order: 5,
  },
  {
    key: 'preferred_time',
    visible: false,
    required: false,
    label: 'Melhor horário para contato',
    placeholder: 'Manhã, tarde ou noite',
    order: 6,
  },
  {
    key: 'preferred_date',
    visible: false,
    required: false,
    label: 'Data preferida',
    placeholder: '',
    order: 7,
  },
  {
    key: 'privacy',
    visible: true,
    required: true,
    label: 'Autorizo o uso dos meus dados para contato e atendimento pela clínica.',
    order: 99,
  },
];

export function defaultCaptureConfig(
  partial?: Partial<SmartHubCaptureConfig>
): SmartHubCaptureConfig {
  return {
    mode: 'whatsapp_direct',
    initial_stage: 'new',
    default_owner_user_id: null,
    form_title: 'Fale conosco',
    form_description: 'Preencha seus dados e nossa equipe entrará em contato.',
    submit_label: 'Enviar',
    success_message: 'Recebemos seus dados. Nossa equipe entrará em contato.',
    redirect_url: null,
    redirect_whatsapp_after_submit: false,
    whatsapp_phone: null,
    whatsapp_message: 'Olá! Gostaria de mais informações.',
    whatsapp_followup_message: null,
    require_privacy_accept: true,
    privacy_text:
      'Autorizo o uso dos meus dados para contato e atendimento pela clínica.',
    privacy_url: '/privacy',
    privacy_version: 'v1',
    dedupe_mode: 'update',
    manual_copy_message:
      'Lead WhatsApp — cadastro manual no CRM (origem Smart Hub).',
    ...partial,
    fields: partial?.fields?.length ? partial.fields : DEFAULT_CAPTURE_FIELDS,
  };
}

export function resolveClickAction(
  clickAction: string | null | undefined,
  buttonType: string
): SmartHubClickAction {
  if (clickAction && clickAction !== 'auto') {
    return clickAction as SmartHubClickAction;
  }
  switch (buttonType) {
    case 'whatsapp':
      return 'whatsapp';
    case 'form':
    case 'appointment':
      return 'form';
    case 'phone':
      return 'phone';
    case 'email':
      return 'email';
    case 'map':
      return 'map';
    case 'info':
      return 'info';
    default:
      return 'link';
  }
}

export function isBookingClickAction(action: string | null | undefined): boolean {
  return action === 'booking';
}

export function mergeCaptureConfig(
  hubConfig?: SmartHubCaptureConfig | null
): SmartHubCaptureConfig {
  return defaultCaptureConfig(hubConfig || {});
}

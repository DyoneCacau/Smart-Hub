import type { EmailLocale, EmailLocaleDictionary } from './types.ts'

export const ptBR: EmailLocaleDictionary = {
  common: {
    appName: 'HealthCare',
    greeting: (name) => `Olá, ${name}!`,
    regards: 'Atenciosamente,',
    teamSignature: (appName) => `Equipe ${appName}`,
    footerHelp: (email) =>
      email
        ? `Precisa de ajuda? Fale conosco em ${email}.`
        : 'Esta é uma mensagem automática. Responda apenas se necessário.',
    ctaFallback: (url) =>
      `Se o botão não funcionar, copie e cole este link no navegador:\n${url}`,
  },
  'password-recovery': {
    subject: 'Redefinição de senha',
    title: 'Recuperação de senha',
    intro: 'Recebemos um pedido para redefinir a senha da sua conta.',
    button: 'Redefinir senha',
    expires: (minutes) => `Este link expira em ${minutes} minutos.`,
    ignore: 'Se você não solicitou essa alteração, pode ignorar este e-mail.',
  },
  'user-invite': {
    subject: (clinicName) => `Convite para entrar em ${clinicName}`,
    title: 'Você foi convidado',
    intro: (inviter, clinic, role) =>
      `${inviter} convidou você para participar de ${clinic} como ${role}.`,
    button: 'Aceitar convite',
  },
  'appointment-confirmation': {
    subject: (clinicName) => `Agendamento confirmado — ${clinicName}`,
    title: 'Agendamento confirmado',
    intro: 'Seu horário foi marcado com sucesso. Confira os detalhes abaixo.',
    when: 'Data e horário',
    professional: 'Profissional',
    service: 'Serviço',
    address: 'Endereço',
    button: 'Ver agendamento',
  },
  'appointment-reminder': {
    subject: (clinicName) => `Lembrete de consulta — ${clinicName}`,
    title: 'Lembrete de consulta',
    intro: (hours) =>
      hours > 0
        ? `Sua consulta é em cerca de ${hours} hora(s).`
        : 'Sua consulta está próxima. Confira os detalhes abaixo.',
    when: 'Data e horário',
    professional: 'Profissional',
    service: 'Serviço',
    address: 'Endereço',
  },
  'crm-new-lead': {
    subject: (leadName) => `Novo lead: ${leadName}`,
    title: 'Novo lead no CRM',
    intro: (clinic) => `Um novo lead chegou para ${clinic}.`,
    name: 'Nome',
    phone: 'Telefone',
    email: 'E-mail',
    source: 'Origem',
    interest: 'Interesse',
    button: 'Abrir lead',
  },
  'payment-confirmation': {
    subject: 'Pagamento confirmado',
    title: 'Pagamento confirmado',
    intro: 'Recebemos e confirmamos o seu pagamento.',
    amount: 'Valor',
    paidAt: 'Pago em',
    method: 'Forma de pagamento',
    description: 'Descrição',
    button: 'Ver comprovante',
  },
}

export const en: EmailLocaleDictionary = {
  common: {
    appName: 'HealthCare',
    greeting: (name) => `Hi, ${name}!`,
    regards: 'Best regards,',
    teamSignature: (appName) => `The ${appName} team`,
    footerHelp: (email) =>
      email
        ? `Need help? Contact us at ${email}.`
        : 'This is an automated message. Please do not reply unless necessary.',
    ctaFallback: (url) =>
      `If the button does not work, copy and paste this link into your browser:\n${url}`,
  },
  'password-recovery': {
    subject: 'Password reset',
    title: 'Password recovery',
    intro: 'We received a request to reset your account password.',
    button: 'Reset password',
    expires: (minutes) => `This link expires in ${minutes} minutes.`,
    ignore: 'If you did not request this change, you can ignore this email.',
  },
  'user-invite': {
    subject: (clinicName) => `Invitation to join ${clinicName}`,
    title: 'You are invited',
    intro: (inviter, clinic, role) =>
      `${inviter} invited you to join ${clinic} as ${role}.`,
    button: 'Accept invite',
  },
  'appointment-confirmation': {
    subject: (clinicName) => `Appointment confirmed — ${clinicName}`,
    title: 'Appointment confirmed',
    intro: 'Your appointment was scheduled successfully. Details below.',
    when: 'Date and time',
    professional: 'Professional',
    service: 'Service',
    address: 'Address',
    button: 'View appointment',
  },
  'appointment-reminder': {
    subject: (clinicName) => `Appointment reminder — ${clinicName}`,
    title: 'Appointment reminder',
    intro: (hours) =>
      hours > 0
        ? `Your appointment is in about ${hours} hour(s).`
        : 'Your appointment is coming up. Details below.',
    when: 'Date and time',
    professional: 'Professional',
    service: 'Service',
    address: 'Address',
  },
  'crm-new-lead': {
    subject: (leadName) => `New lead: ${leadName}`,
    title: 'New CRM lead',
    intro: (clinic) => `A new lead arrived for ${clinic}.`,
    name: 'Name',
    phone: 'Phone',
    email: 'Email',
    source: 'Source',
    interest: 'Interest',
    button: 'Open lead',
  },
  'payment-confirmation': {
    subject: 'Payment confirmed',
    title: 'Payment confirmed',
    intro: 'We received and confirmed your payment.',
    amount: 'Amount',
    paidAt: 'Paid at',
    method: 'Payment method',
    description: 'Description',
    button: 'View receipt',
  },
}

const dictionaries: Record<EmailLocale, EmailLocaleDictionary> = {
  'pt-BR': ptBR,
  en,
}

export const DEFAULT_EMAIL_LOCALE: EmailLocale = 'pt-BR'

export function resolveEmailLocale(locale?: string | null): EmailLocale {
  if (locale === 'en' || locale === 'en-US' || locale === 'en-GB') return 'en'
  return 'pt-BR'
}

export function getEmailDictionary(locale?: string | null): EmailLocaleDictionary {
  return dictionaries[resolveEmailLocale(locale)]
}

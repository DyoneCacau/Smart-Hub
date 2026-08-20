/**
 * Tipos e contratos dos templates transacionais (Edge Functions).
 * Fonte de verdade do conteúdo: este módulo no servidor.
 */

export type EmailLocale = 'pt-BR' | 'en'

export type EmailTemplateId =
  | 'password-recovery'
  | 'user-invite'
  | 'appointment-confirmation'
  | 'appointment-reminder'
  | 'crm-new-lead'
  | 'payment-confirmation'

export const EMAIL_TEMPLATE_IDS: readonly EmailTemplateId[] = [
  'password-recovery',
  'user-invite',
  'appointment-confirmation',
  'appointment-reminder',
  'crm-new-lead',
  'payment-confirmation',
] as const

export interface EmailBrandContext {
  appName?: string
  clinicName?: string
  logoUrl?: string
  supportEmail?: string
  primaryColor?: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export interface EmailRenderOptions {
  locale?: string | null
  brand?: EmailBrandContext
}

export interface PasswordRecoveryVars {
  recipientName: string
  resetUrl: string
  expiresInMinutes?: number
}

export interface UserInviteVars {
  recipientName: string
  inviterName: string
  clinicName: string
  roleLabel: string
  inviteUrl: string
}

export interface AppointmentConfirmationVars {
  patientName: string
  clinicName: string
  appointmentDate: string
  appointmentTime: string
  professionalName: string
  serviceName?: string
  clinicAddress?: string
  manageUrl?: string
}

export interface AppointmentReminderVars {
  patientName: string
  clinicName: string
  appointmentDate: string
  appointmentTime: string
  professionalName: string
  serviceName?: string
  clinicAddress?: string
  hoursBefore?: number
}

export interface CrmNewLeadVars {
  recipientName: string
  clinicName: string
  leadName: string
  leadPhone?: string
  leadEmail?: string
  leadSource?: string
  leadInterest?: string
  leadUrl?: string
}

export interface PaymentConfirmationVars {
  recipientName: string
  amountLabel: string
  paidAtLabel: string
  paymentMethodLabel?: string
  description?: string
  receiptUrl?: string
  clinicName?: string
}

export type TemplateVarsMap = {
  'password-recovery': PasswordRecoveryVars
  'user-invite': UserInviteVars
  'appointment-confirmation': AppointmentConfirmationVars
  'appointment-reminder': AppointmentReminderVars
  'crm-new-lead': CrmNewLeadVars
  'payment-confirmation': PaymentConfirmationVars
}

export interface EmailCommonCopy {
  appName: string
  greeting: (name: string) => string
  regards: string
  teamSignature: (appName: string) => string
  footerHelp: (supportEmail?: string) => string
  ctaFallback: (url: string) => string
}

export interface EmailLocaleDictionary {
  common: EmailCommonCopy
  'password-recovery': {
    subject: string
    title: string
    intro: string
    button: string
    expires: (minutes: number) => string
    ignore: string
  }
  'user-invite': {
    subject: (clinicName: string) => string
    title: string
    intro: (inviter: string, clinic: string, role: string) => string
    button: string
  }
  'appointment-confirmation': {
    subject: (clinicName: string) => string
    title: string
    intro: string
    when: string
    professional: string
    service: string
    address: string
    button: string
  }
  'appointment-reminder': {
    subject: (clinicName: string) => string
    title: string
    intro: (hours: number) => string
    when: string
    professional: string
    service: string
    address: string
  }
  'crm-new-lead': {
    subject: (leadName: string) => string
    title: string
    intro: (clinic: string) => string
    name: string
    phone: string
    email: string
    source: string
    interest: string
    button: string
  }
  'payment-confirmation': {
    subject: string
    title: string
    intro: string
    amount: string
    paidAt: string
    method: string
    description: string
    button: string
  }
}

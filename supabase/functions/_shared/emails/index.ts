export type {
  AppointmentConfirmationVars,
  AppointmentReminderVars,
  CrmNewLeadVars,
  EmailBrandContext,
  EmailLocale,
  EmailRenderOptions,
  EmailTemplateId,
  PasswordRecoveryVars,
  PaymentConfirmationVars,
  RenderedEmail,
  TemplateVarsMap,
  UserInviteVars,
} from './types.ts'

export { EMAIL_TEMPLATE_IDS } from './types.ts'
export { DEFAULT_EMAIL_LOCALE, resolveEmailLocale } from './locales.ts'
export { isEmailTemplateId, renderRegisteredTemplate } from './registry.ts'
export { parseBrand } from './validate.ts'
export { deliverTemplatedEmail, requireResendConfig } from './deliver.ts'

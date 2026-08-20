import {
  ctaFallbackHtml,
  detailsTable,
  HEALTHCARE_EMAIL_LOGO_URL,
  HEALTHCARE_HEADER_BLUE,
  paragraph,
  plainText,
  primaryButton,
  renderEmailLayout,
} from './layout.ts'
import { getEmailDictionary, resolveEmailLocale } from './locales.ts'
import type {
  AppointmentConfirmationVars,
  AppointmentReminderVars,
  CrmNewLeadVars,
  EmailBrandContext,
  EmailRenderOptions,
  EmailTemplateId,
  PasswordRecoveryVars,
  PaymentConfirmationVars,
  RenderedEmail,
  TemplateVarsMap,
  UserInviteVars,
} from './types.ts'
import {
  optionalEmail,
  optionalHttpsUrl,
  optionalNumber,
  optionalString,
  requireHttpsUrl,
  requireObject,
  requireString,
} from './validate.ts'

function withClinicBrand(
  options: EmailRenderOptions,
  clinicName?: string,
): EmailBrandContext {
  return {
    ...options.brand,
    clinicName: options.brand?.clinicName || clinicName,
  }
}

export function renderPasswordRecovery(
  vars: PasswordRecoveryVars,
  options: EmailRenderOptions = {},
): RenderedEmail {
  const locale = resolveEmailLocale(options.locale)
  const dict = getEmailDictionary(locale)
  const copy = dict['password-recovery']
  const brand = {
    ...(options.brand || {}),
    logoUrl: HEALTHCARE_EMAIL_LOGO_URL,
    primaryColor: HEALTHCARE_HEADER_BLUE,
    appName: (options.brand || {}).appName || dict.common.appName,
  }
  const appName = brand.appName || dict.common.appName
  const expires = vars.expiresInMinutes ?? 60

  const bodyHtml = [
    paragraph(dict.common.greeting(vars.recipientName)),
    paragraph(copy.intro),
    paragraph(copy.expires(expires)),
    primaryButton(copy.button, vars.resetUrl, brand.primaryColor),
    ctaFallbackHtml(dict.common.ctaFallback(vars.resetUrl)),
    paragraph(copy.ignore),
  ].join('')

  return {
    subject: copy.subject,
    html: renderEmailLayout(
      {
        title: copy.title,
        preheader: copy.intro,
        bodyHtml,
        footerHelp: dict.common.footerHelp(brand.supportEmail),
        appName,
        regards: dict.common.regards,
        teamSignature: dict.common.teamSignature(appName),
        lang: locale,
        headerVariant: 'platform',
      },
      brand,
    ),
    text: plainText([
      dict.common.greeting(vars.recipientName),
      copy.intro,
      copy.expires(expires),
      vars.resetUrl,
      copy.ignore,
      dict.common.regards,
      dict.common.teamSignature(appName),
    ]),
  }
}

export function renderUserInvite(
  vars: UserInviteVars,
  options: EmailRenderOptions = {},
): RenderedEmail {
  const locale = resolveEmailLocale(options.locale)
  const dict = getEmailDictionary(locale)
  const copy = dict['user-invite']
  const brand = withClinicBrand(options, vars.clinicName)
  const appName = brand.appName || dict.common.appName
  const intro = copy.intro(vars.inviterName, vars.clinicName, vars.roleLabel)

  const bodyHtml = [
    paragraph(dict.common.greeting(vars.recipientName)),
    paragraph(intro),
    primaryButton(copy.button, vars.inviteUrl, brand.primaryColor),
    ctaFallbackHtml(dict.common.ctaFallback(vars.inviteUrl)),
  ].join('')

  return {
    subject: copy.subject(vars.clinicName),
    html: renderEmailLayout(
      {
        title: copy.title,
        preheader: intro,
        bodyHtml,
        footerHelp: dict.common.footerHelp(brand.supportEmail),
        appName,
        regards: dict.common.regards,
        teamSignature: dict.common.teamSignature(appName),
        lang: locale,
      },
      brand,
    ),
    text: plainText([
      dict.common.greeting(vars.recipientName),
      intro,
      vars.inviteUrl,
      dict.common.regards,
      dict.common.teamSignature(appName),
    ]),
  }
}

export function renderAppointmentConfirmation(
  vars: AppointmentConfirmationVars,
  options: EmailRenderOptions = {},
): RenderedEmail {
  const locale = resolveEmailLocale(options.locale)
  const dict = getEmailDictionary(locale)
  const copy = dict['appointment-confirmation']
  const brand = withClinicBrand(options, vars.clinicName)
  const appName = brand.appName || dict.common.appName
  const when = `${vars.appointmentDate} · ${vars.appointmentTime}`

  const bodyHtml = [
    paragraph(dict.common.greeting(vars.patientName)),
    paragraph(copy.intro),
    detailsTable([
      [copy.when, when],
      [copy.professional, vars.professionalName],
      [copy.service, vars.serviceName],
      [copy.address, vars.clinicAddress],
    ]),
    vars.manageUrl ? primaryButton(copy.button, vars.manageUrl, brand.primaryColor) : '',
    vars.manageUrl ? ctaFallbackHtml(dict.common.ctaFallback(vars.manageUrl)) : '',
  ].join('')

  return {
    subject: copy.subject(vars.clinicName),
    html: renderEmailLayout(
      {
        title: copy.title,
        preheader: when,
        bodyHtml,
        footerHelp: dict.common.footerHelp(brand.supportEmail),
        appName,
        regards: dict.common.regards,
        teamSignature: dict.common.teamSignature(appName),
        lang: locale,
      },
      brand,
    ),
    text: plainText([
      dict.common.greeting(vars.patientName),
      copy.intro,
      `${copy.when}: ${when}`,
      `${copy.professional}: ${vars.professionalName}`,
      vars.serviceName ? `${copy.service}: ${vars.serviceName}` : '',
      vars.clinicAddress ? `${copy.address}: ${vars.clinicAddress}` : '',
      vars.manageUrl || '',
      dict.common.regards,
      dict.common.teamSignature(appName),
    ]),
  }
}

export function renderAppointmentReminder(
  vars: AppointmentReminderVars,
  options: EmailRenderOptions = {},
): RenderedEmail {
  const locale = resolveEmailLocale(options.locale)
  const dict = getEmailDictionary(locale)
  const copy = dict['appointment-reminder']
  const brand = withClinicBrand(options, vars.clinicName)
  const appName = brand.appName || dict.common.appName
  const hours = vars.hoursBefore ?? 24
  const when = `${vars.appointmentDate} · ${vars.appointmentTime}`

  const bodyHtml = [
    paragraph(dict.common.greeting(vars.patientName)),
    paragraph(copy.intro(hours)),
    detailsTable([
      [copy.when, when],
      [copy.professional, vars.professionalName],
      [copy.service, vars.serviceName],
      [copy.address, vars.clinicAddress],
    ]),
  ].join('')

  return {
    subject: copy.subject(vars.clinicName),
    html: renderEmailLayout(
      {
        title: copy.title,
        preheader: when,
        bodyHtml,
        footerHelp: dict.common.footerHelp(brand.supportEmail),
        appName,
        regards: dict.common.regards,
        teamSignature: dict.common.teamSignature(appName),
        lang: locale,
      },
      brand,
    ),
    text: plainText([
      dict.common.greeting(vars.patientName),
      copy.intro(hours),
      `${copy.when}: ${when}`,
      `${copy.professional}: ${vars.professionalName}`,
      vars.serviceName ? `${copy.service}: ${vars.serviceName}` : '',
      vars.clinicAddress ? `${copy.address}: ${vars.clinicAddress}` : '',
      dict.common.regards,
      dict.common.teamSignature(appName),
    ]),
  }
}

export function renderCrmNewLead(
  vars: CrmNewLeadVars,
  options: EmailRenderOptions = {},
): RenderedEmail {
  const locale = resolveEmailLocale(options.locale)
  const dict = getEmailDictionary(locale)
  const copy = dict['crm-new-lead']
  const brand = withClinicBrand(options, vars.clinicName)
  const appName = brand.appName || dict.common.appName
  const intro = copy.intro(vars.clinicName)

  const bodyHtml = [
    paragraph(dict.common.greeting(vars.recipientName)),
    paragraph(intro),
    detailsTable([
      [copy.name, vars.leadName],
      [copy.phone, vars.leadPhone],
      [copy.email, vars.leadEmail],
      [copy.source, vars.leadSource],
      [copy.interest, vars.leadInterest],
    ]),
    vars.leadUrl ? primaryButton(copy.button, vars.leadUrl, brand.primaryColor) : '',
    vars.leadUrl ? ctaFallbackHtml(dict.common.ctaFallback(vars.leadUrl)) : '',
  ].join('')

  return {
    subject: copy.subject(vars.leadName),
    html: renderEmailLayout(
      {
        title: copy.title,
        preheader: copy.subject(vars.leadName),
        bodyHtml,
        footerHelp: dict.common.footerHelp(brand.supportEmail),
        appName,
        regards: dict.common.regards,
        teamSignature: dict.common.teamSignature(appName),
        lang: locale,
      },
      brand,
    ),
    text: plainText([
      dict.common.greeting(vars.recipientName),
      intro,
      `${copy.name}: ${vars.leadName}`,
      vars.leadPhone ? `${copy.phone}: ${vars.leadPhone}` : '',
      vars.leadEmail ? `${copy.email}: ${vars.leadEmail}` : '',
      vars.leadSource ? `${copy.source}: ${vars.leadSource}` : '',
      vars.leadInterest ? `${copy.interest}: ${vars.leadInterest}` : '',
      vars.leadUrl || '',
      dict.common.regards,
      dict.common.teamSignature(appName),
    ]),
  }
}

export function renderPaymentConfirmation(
  vars: PaymentConfirmationVars,
  options: EmailRenderOptions = {},
): RenderedEmail {
  const locale = resolveEmailLocale(options.locale)
  const dict = getEmailDictionary(locale)
  const copy = dict['payment-confirmation']
  const brand = withClinicBrand(options, vars.clinicName)
  const appName = brand.appName || dict.common.appName

  const bodyHtml = [
    paragraph(dict.common.greeting(vars.recipientName)),
    paragraph(copy.intro),
    detailsTable([
      [copy.amount, vars.amountLabel],
      [copy.paidAt, vars.paidAtLabel],
      [copy.method, vars.paymentMethodLabel],
      [copy.description, vars.description],
    ]),
    vars.receiptUrl ? primaryButton(copy.button, vars.receiptUrl, brand.primaryColor) : '',
    vars.receiptUrl ? ctaFallbackHtml(dict.common.ctaFallback(vars.receiptUrl)) : '',
  ].join('')

  return {
    subject: copy.subject,
    html: renderEmailLayout(
      {
        title: copy.title,
        preheader: `${copy.amount}: ${vars.amountLabel}`,
        bodyHtml,
        footerHelp: dict.common.footerHelp(brand.supportEmail),
        appName,
        regards: dict.common.regards,
        teamSignature: dict.common.teamSignature(appName),
        lang: locale,
      },
      brand,
    ),
    text: plainText([
      dict.common.greeting(vars.recipientName),
      copy.intro,
      `${copy.amount}: ${vars.amountLabel}`,
      `${copy.paidAt}: ${vars.paidAtLabel}`,
      vars.paymentMethodLabel ? `${copy.method}: ${vars.paymentMethodLabel}` : '',
      vars.description ? `${copy.description}: ${vars.description}` : '',
      vars.receiptUrl || '',
      dict.common.regards,
      dict.common.teamSignature(appName),
    ]),
  }
}

function parsePasswordRecovery(data: unknown): PasswordRecoveryVars {
  const obj = requireObject(data)
  return {
    recipientName: requireString(obj, 'recipientName', 200),
    resetUrl: requireHttpsUrl(obj, 'resetUrl'),
    expiresInMinutes: optionalNumber(obj, 'expiresInMinutes'),
  }
}

function parseUserInvite(data: unknown): UserInviteVars {
  const obj = requireObject(data)
  return {
    recipientName: requireString(obj, 'recipientName', 200),
    inviterName: requireString(obj, 'inviterName', 200),
    clinicName: requireString(obj, 'clinicName', 200),
    roleLabel: requireString(obj, 'roleLabel', 120),
    inviteUrl: requireHttpsUrl(obj, 'inviteUrl'),
  }
}

function parseAppointmentConfirmation(data: unknown): AppointmentConfirmationVars {
  const obj = requireObject(data)
  return {
    patientName: requireString(obj, 'patientName', 200),
    clinicName: requireString(obj, 'clinicName', 200),
    appointmentDate: requireString(obj, 'appointmentDate', 80),
    appointmentTime: requireString(obj, 'appointmentTime', 40),
    professionalName: requireString(obj, 'professionalName', 200),
    serviceName: optionalString(obj, 'serviceName', 200),
    clinicAddress: optionalString(obj, 'clinicAddress', 300),
    manageUrl: optionalHttpsUrl(obj, 'manageUrl'),
  }
}

function parseAppointmentReminder(data: unknown): AppointmentReminderVars {
  const obj = requireObject(data)
  return {
    patientName: requireString(obj, 'patientName', 200),
    clinicName: requireString(obj, 'clinicName', 200),
    appointmentDate: requireString(obj, 'appointmentDate', 80),
    appointmentTime: requireString(obj, 'appointmentTime', 40),
    professionalName: requireString(obj, 'professionalName', 200),
    serviceName: optionalString(obj, 'serviceName', 200),
    clinicAddress: optionalString(obj, 'clinicAddress', 300),
    hoursBefore: optionalNumber(obj, 'hoursBefore'),
  }
}

function parseCrmNewLead(data: unknown): CrmNewLeadVars {
  const obj = requireObject(data)
  return {
    recipientName: requireString(obj, 'recipientName', 200),
    clinicName: requireString(obj, 'clinicName', 200),
    leadName: requireString(obj, 'leadName', 200),
    leadPhone: optionalString(obj, 'leadPhone', 40),
    leadEmail: optionalEmail(obj, 'leadEmail'),
    leadSource: optionalString(obj, 'leadSource', 120),
    leadInterest: optionalString(obj, 'leadInterest', 200),
    leadUrl: optionalHttpsUrl(obj, 'leadUrl'),
  }
}

function parsePaymentConfirmation(data: unknown): PaymentConfirmationVars {
  const obj = requireObject(data)
  return {
    recipientName: requireString(obj, 'recipientName', 200),
    amountLabel: requireString(obj, 'amountLabel', 80),
    paidAtLabel: requireString(obj, 'paidAtLabel', 80),
    paymentMethodLabel: optionalString(obj, 'paymentMethodLabel', 80),
    description: optionalString(obj, 'description', 300),
    receiptUrl: optionalHttpsUrl(obj, 'receiptUrl'),
    clinicName: optionalString(obj, 'clinicName', 200),
  }
}

type TemplateHandler<K extends EmailTemplateId> = {
  parse: (data: unknown) => TemplateVarsMap[K]
  render: (vars: TemplateVarsMap[K], options?: EmailRenderOptions) => RenderedEmail
}

const registry: { [K in EmailTemplateId]: TemplateHandler<K> } = {
  'password-recovery': {
    parse: parsePasswordRecovery,
    render: renderPasswordRecovery,
  },
  'user-invite': {
    parse: parseUserInvite,
    render: renderUserInvite,
  },
  'appointment-confirmation': {
    parse: parseAppointmentConfirmation,
    render: renderAppointmentConfirmation,
  },
  'appointment-reminder': {
    parse: parseAppointmentReminder,
    render: renderAppointmentReminder,
  },
  'crm-new-lead': {
    parse: parseCrmNewLead,
    render: renderCrmNewLead,
  },
  'payment-confirmation': {
    parse: parsePaymentConfirmation,
    render: renderPaymentConfirmation,
  },
}

export function isEmailTemplateId(value: unknown): value is EmailTemplateId {
  return typeof value === 'string' && value in registry
}

export function renderRegisteredTemplate(
  template: EmailTemplateId,
  data: unknown,
  options: EmailRenderOptions = {},
): RenderedEmail {
  const handler = registry[template]
  const vars = handler.parse(data)
  return handler.render(vars as never, options)
}

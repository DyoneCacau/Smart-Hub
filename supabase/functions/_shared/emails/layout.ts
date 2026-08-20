import type { EmailBrandContext } from './types.ts'

const DEFAULT_PRIMARY = '#0ea5e9'
const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function resolveBrandColor(color?: string | null): string {
  if (color && HEX_COLOR.test(color.trim())) return color.trim()
  return DEFAULT_PRIMARY
}

export function ctaFallbackHtml(message: string): string {
  return `<p style="margin:0 0 12px;font-size:12px;color:#94a3b8;white-space:pre-line;">${escapeHtml(message)}</p>`
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">${escapeHtml(text)}</p>`
}

export function primaryButton(label: string, url: string, color?: string | null): string {
  const safeUrl = escapeHtml(url)
  const safeLabel = escapeHtml(label)
  const safeColor = resolveBrandColor(color)
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td style="border-radius:8px;background:${safeColor};">
          <a href="${safeUrl}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
            ${safeLabel}
          </a>
        </td>
      </tr>
    </table>`
}

export function detailsTable(rows: Array<[string, string | undefined | null]>): string {
  const cells = rows
    .filter(([, value]) => Boolean(value && String(value).trim()))
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#64748b;width:140px;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:8px 0;font-size:14px;color:#0f172a;font-weight:500;">${escapeHtml(String(value))}</td>
      </tr>`,
    )
    .join('')

  if (!cells) return ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">${cells}</table>`
}

export function plainText(lines: Array<string | undefined | null>): string {
  return lines
    .map((line) => (line == null ? '' : String(line).trim()))
    .filter(Boolean)
    .join('\n\n')
}

/** Logo oficial (URL absoluta — clientes de e-mail não resolvem caminhos relativos). */
export const HEALTHCARE_EMAIL_LOGO_URL = 'https://www.healthcare.app.br/logo-email.png'
export const HEALTHCARE_HEADER_BLUE = '#2563EB'
export const HEALTHCARE_TAGLINE = 'Sistema Inteligente para Clínicas'

export interface LayoutContent {
  title: string
  preheader?: string
  bodyHtml: string
  footerHelp: string
  appName: string
  regards: string
  teamSignature: string
  lang?: string
  /** Cabeçalho azul centrado com logo oficial (ex.: reset de senha). */
  headerVariant?: 'default' | 'platform'
}

function renderDefaultHeader(
  appName: string,
  clinic: string,
  primary: string,
  brand: EmailBrandContext,
): string {
  const logo = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${appName}" width="40" height="40" style="display:block;border:0;outline:none;text-decoration:none;border-radius:8px;" />`
    : `<div style="width:40px;height:40px;border-radius:8px;background:${primary};">&nbsp;</div>`

  return `
          <tr>
            <td style="padding:24px 28px;border-bottom:1px solid #e2e8f0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:12px;vertical-align:middle;">${logo}</td>
                  <td style="vertical-align:middle;">
                    <div style="font-size:16px;font-weight:700;color:#0f172a;line-height:1.3;">${appName}</div>
                    ${clinic ? `<div style="font-size:13px;color:#64748b;line-height:1.4;">${clinic}</div>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
}

/**
 * Cabeçalho de marca HealthCare (tabelas + CSS inline — Gmail/Outlook/Apple/Yahoo).
 */
function renderPlatformHeader(): string {
  const logoUrl = escapeHtml(HEALTHCARE_EMAIL_LOGO_URL)
  const tagline = escapeHtml(HEALTHCARE_TAGLINE)
  return `
          <tr>
            <td align="center" bgcolor="${HEALTHCARE_HEADER_BLUE}" style="background-color:${HEALTHCARE_HEADER_BLUE};padding:28px 20px 24px;text-align:center;">
              <!--[if mso]>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
              <![endif]-->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 auto;max-width:520px;">
                <tr>
                  <td align="center" style="padding:0;text-align:center;">
                    <img
                      src="${logoUrl}"
                      alt="HealthCare"
                      width="82"
                      height="82"
                      style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;max-width:82px;height:auto;"
                    />
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:20px 0 0;text-align:center;">
                    <div style="font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;mso-line-height-rule:exactly;">HealthCare</div>
                    <div style="font-size:14px;font-weight:400;color:#ffffff;line-height:1.45;padding-top:6px;mso-line-height-rule:exactly;">${tagline}</div>
                  </td>
                </tr>
              </table>
              <!--[if mso]>
              </td></tr></table>
              <![endif]-->
            </td>
          </tr>`
}

export function renderEmailLayout(
  content: LayoutContent,
  brand: EmailBrandContext = {},
): string {
  const primary = resolveBrandColor(brand.primaryColor)
  const clinic = brand.clinicName ? escapeHtml(brand.clinicName) : ''
  const appName = escapeHtml(content.appName)
  const title = escapeHtml(content.title)
  const preheader = content.preheader ? escapeHtml(content.preheader) : ''
  const lang = escapeHtml(content.lang || 'pt-BR')
  const headerHtml =
    content.headerVariant === 'platform'
      ? renderPlatformHeader()
      : renderDefaultHeader(appName, clinic, primary, brand)

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:32px 16px;width:100%;">
    <tr>
      <td align="center" style="padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          ${headerHtml}
          <tr>
            <td style="padding:28px 20px;">
              <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0f172a;">${title}</h1>
              ${content.bodyHtml}
              <p style="margin:24px 0 0;font-size:14px;color:#475569;">${escapeHtml(content.regards)}<br/>${escapeHtml(content.teamSignature)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 20px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">${escapeHtml(content.footerHelp)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

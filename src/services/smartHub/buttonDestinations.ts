import type { SmartHubButtonType } from '@/types/smartHub';

export function buildDestinationUrl(
  type: SmartHubButtonType | string,
  rawUrl: string | null | undefined,
  whatsappMessage?: string | null,
  emailSubject?: string | null
): string | null {
  if (!rawUrl?.trim()) return null;
  const value = rawUrl.trim();

  switch (type) {
    case 'whatsapp': {
      let href = value;
      if (!/^https?:\/\//i.test(value) && !value.startsWith('wa.me/')) {
        const digits = value.replace(/\D/g, '');
        href = digits ? `https://wa.me/${digits}` : value;
      } else if (value.startsWith('wa.me/')) {
        href = `https://${value}`;
      }
      if (whatsappMessage?.trim()) {
        const sep = href.includes('?') ? '&' : '?';
        href = `${href}${sep}text=${encodeURIComponent(whatsappMessage.trim())}`;
      }
      return href;
    }
    case 'phone': {
      const digits = value.replace(/[^\d+]/g, '');
      return digits.startsWith('tel:') ? digits : `tel:${digits}`;
    }
    case 'email': {
      const address = value.replace(/^mailto:/i, '');
      const base = `mailto:${address}`;
      if (emailSubject?.trim()) {
        return `${base}?subject=${encodeURIComponent(emailSubject.trim())}`;
      }
      return base;
    }
    case 'instagram':
      if (/instagram\.com/i.test(value)) return ensureHttp(value);
      return `https://instagram.com/${value.replace(/^@/, '')}`;
    case 'facebook':
      if (/facebook\.com/i.test(value)) return ensureHttp(value);
      return `https://facebook.com/${value.replace(/^@/, '')}`;
    case 'tiktok':
      if (/tiktok\.com/i.test(value)) return ensureHttp(value);
      return `https://tiktok.com/@${value.replace(/^@/, '')}`;
    case 'youtube':
      if (/youtube\.com|youtu\.be/i.test(value)) return ensureHttp(value);
      return `https://youtube.com/${value}`;
    case 'map':
    case 'site':
    case 'link':
    case 'appointment':
    case 'procedure':
    case 'social':
    default:
      return ensureHttp(value);
  }
}

function ensureHttp(value: string): string {
  if (/^https?:\/\//i.test(value) || value.startsWith('mailto:') || value.startsWith('tel:')) {
    return value;
  }
  return `https://${value}`;
}

export function validateSocialDomain(
  type: SmartHubButtonType | string,
  url: string
): string | null {
  const href = url.toLowerCase();
  if (type === 'instagram' && href && !/instagram\.com|^\@?[\w.]+$/.test(href)) {
    return 'Informe um perfil ou link do Instagram.';
  }
  if (type === 'facebook' && href && !/facebook\.com|^\@?[\w.]+$/.test(href)) {
    return 'Informe um perfil ou link do Facebook.';
  }
  if (type === 'tiktok' && href && !/tiktok\.com|^\@?[\w.]+$/.test(href)) {
    return 'Informe um perfil ou link do TikTok.';
  }
  if (type === 'youtube' && href && !/youtube\.com|youtu\.be|^\@?[\w.]+$/.test(href)) {
    return 'Informe um canal ou link do YouTube.';
  }
  return null;
}

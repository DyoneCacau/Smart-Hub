import type { SmartHubAssetKind, SmartHubStylePreset, SmartHubVisualConfig } from '@/types/smartHub';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const SMART_HUB_IMAGE_LIMITS: Record<
  SmartHubAssetKind,
  { maxBytes: number; label: string; aspectHint: string }
> = {
  logo: { maxBytes: 3 * 1024 * 1024, label: 'Logo', aspectHint: '1:1' },
  profile: { maxBytes: 3 * 1024 * 1024, label: 'Foto de perfil', aspectHint: '1:1' },
  banner: { maxBytes: 6 * 1024 * 1024, label: 'Banner', aspectHint: '16:9 · ~1200×630' },
  button: { maxBytes: 2 * 1024 * 1024, label: 'Imagem do botão', aspectHint: '1:1' },
  background: { maxBytes: 6 * 1024 * 1024, label: 'Fundo', aspectHint: 'livre' },
  other: { maxBytes: 3 * 1024 * 1024, label: 'Imagem', aspectHint: 'livre' },
};

export function validateSmartHubImage(
  file: File,
  kind: SmartHubAssetKind
): { ok: true } | { ok: false; message: string } {
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, message: 'Escolha uma imagem JPG, PNG ou WebP.' };
  }
  const limit = SMART_HUB_IMAGE_LIMITS[kind]?.maxBytes ?? 3 * 1024 * 1024;
  if (file.size > limit) {
    const mb = Math.round(limit / (1024 * 1024));
    return { ok: false, message: `A imagem ultrapassa o tamanho permitido (${mb} MB).` };
  }
  const name = file.name.toLowerCase();
  if (/\.(svg|html?|exe|js|php|sh)$/i.test(name)) {
    return { ok: false, message: 'Este tipo de arquivo não é permitido.' };
  }
  return { ok: true };
}

export function normalizeAssetFileName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return base || `image-${Date.now()}`;
}

/** Converte para WebP via canvas quando possível; fallback no arquivo original. */
export async function compressImageToWebp(
  file: File,
  opts: { maxWidth?: number; quality?: number } = {}
): Promise<File> {
  const maxWidth = opts.maxWidth ?? 1600;
  const quality = opts.quality ?? 0.82;

  if (!ALLOWED_MIME.has(file.type) || typeof createImageBitmap === 'undefined') {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / Math.max(bitmap.width, 1));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', quality)
    );
    if (!blob || blob.size === 0) return file;

    const base = normalizeAssetFileName(file.name.replace(/\.[^.]+$/, ''));
    return new File([blob], `${base}.webp`, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    return file;
  }
}

export function relativeLuminance(hex: string): number {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return 0.5;
  const r = parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = parseInt(cleaned.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function isPoorContrast(bg: string, fg: string): boolean {
  try {
    return contrastRatio(bg, fg) < 3;
  } catch {
    return false;
  }
}

export function isNearInvisible(bg: string, fg: string): boolean {
  try {
    return contrastRatio(bg, fg) < 1.4;
  } catch {
    return false;
  }
}

/** Escolhe texto branco ou escuro conforme o fundo (para legibilidade). */
export function pickContrastingTextColor(bg: string, fallbackBg = '#0F766E'): string {
  const normalized = normalizeHexColor(bg, fallbackBg);
  return relativeLuminance(normalized) > 0.45 ? '#0F172A' : '#FFFFFF';
}

/**
 * Cor de texto para exibição pública.
 * Se o contraste salvo for fraco, usa branco/escuro só na renderização —
 * não altera valores persistidos.
 */
export function resolveDisplayTextColor(
  bg: string | null | undefined,
  fg: string | null | undefined,
  defaults?: { bg?: string; fg?: string }
): string {
  const bgHex = normalizeHexColor(bg || defaults?.bg || '#0F766E');
  const fgHex = normalizeHexColor(fg || defaults?.fg || '#FFFFFF', '#FFFFFF');
  if (isPoorContrast(bgHex, fgHex)) {
    return pickContrastingTextColor(bgHex);
  }
  return fgHex;
}

export function normalizeHexColor(value: string, fallback = '#0F766E'): string {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v[1];
    const g = v[2];
    const b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

export const STYLE_PRESETS: Record<
  SmartHubStylePreset,
  {
    primary_color: string;
    secondary_color: string;
    visual_config: SmartHubVisualConfig;
  }
> = {
  clean: {
    primary_color: '#0F766E',
    secondary_color: '#134E4A',
    visual_config: {
      background_mode: 'solid',
      background_color: '#F8FAFC',
      text_color: '#0F172A',
      button_bg_color: '#0F766E',
      button_text_color: '#FFFFFF',
      card_bg_color: '#FFFFFF',
      border_color: '#E2E8F0',
      content_align: 'center',
      max_width: 'md',
      border_radius: 'xl',
      shadow_style: 'sm',
      spacing: 'normal',
    },
  },
  elegant: {
    primary_color: '#1E293B',
    secondary_color: '#334155',
    visual_config: {
      background_mode: 'solid',
      background_color: '#FAFAF9',
      text_color: '#1C1917',
      button_bg_color: '#1E293B',
      button_text_color: '#F8FAFC',
      card_bg_color: '#FFFFFF',
      border_color: '#D6D3D1',
      content_align: 'center',
      max_width: 'md',
      border_radius: 'lg',
      shadow_style: 'md',
      spacing: 'relaxed',
      font_weight_title: 'semibold',
    },
  },
  colorful: {
    primary_color: '#DB2777',
    secondary_color: '#7C3AED',
    visual_config: {
      background_mode: 'gradient',
      gradient_from: '#FDF2F8',
      gradient_to: '#EDE9FE',
      text_color: '#3B0764',
      button_bg_color: '#DB2777',
      button_text_color: '#FFFFFF',
      card_bg_color: '#FFFFFF',
      border_color: '#FBCFE8',
      content_align: 'center',
      max_width: 'md',
      border_radius: 'xl',
      shadow_style: 'md',
      spacing: 'normal',
    },
  },
  minimal: {
    primary_color: '#18181B',
    secondary_color: '#3F3F46',
    visual_config: {
      background_mode: 'solid',
      background_color: '#FFFFFF',
      text_color: '#18181B',
      button_bg_color: '#18181B',
      button_text_color: '#FFFFFF',
      card_bg_color: '#FAFAFA',
      border_color: '#E4E4E7',
      content_align: 'center',
      max_width: 'sm',
      border_radius: 'md',
      shadow_style: 'none',
      spacing: 'compact',
    },
  },
  premium: {
    primary_color: '#B45309',
    secondary_color: '#78350F',
    visual_config: {
      background_mode: 'gradient',
      gradient_from: '#FFFBEB',
      gradient_to: '#FEF3C7',
      text_color: '#451A03',
      button_bg_color: '#B45309',
      button_text_color: '#FFFBEB',
      card_bg_color: '#FFFFFF',
      border_color: '#FDE68A',
      content_align: 'center',
      max_width: 'md',
      border_radius: 'xl',
      shadow_style: 'lg',
      spacing: 'relaxed',
      font_weight_title: 'bold',
      banner_overlay_color: '#78350F',
      banner_overlay_opacity: 0.25,
    },
  },
  whatsapp: {
    primary_color: '#16A34A',
    secondary_color: '#166534',
    visual_config: {
      background_mode: 'solid',
      background_color: '#F0FDF4',
      text_color: '#14532D',
      button_bg_color: '#16A34A',
      button_text_color: '#FFFFFF',
      card_bg_color: '#FFFFFF',
      border_color: '#BBF7D0',
      content_align: 'center',
      max_width: 'md',
      border_radius: 'xl',
      shadow_style: 'sm',
      spacing: 'normal',
      floating_whatsapp: true,
    },
  },
};

export function mergeVisualConfig(
  preset: SmartHubStylePreset | string | null | undefined,
  config: SmartHubVisualConfig | null | undefined
): SmartHubVisualConfig {
  const base =
    STYLE_PRESETS[(preset as SmartHubStylePreset) || 'clean']?.visual_config ||
    STYLE_PRESETS.clean.visual_config;
  return { ...base, ...(config || {}) };
}

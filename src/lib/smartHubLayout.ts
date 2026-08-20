import type { SmartHubLayoutBlock } from '@/types/smartHub';

export const DEFAULT_HUB_LAYOUT_BLOCKS: SmartHubLayoutBlock[] = [
  'banner',
  'logo',
  'header',
  'whatsapp',
  'buttons',
  'social',
  'contact',
  'map',
  'footer',
];

/** Blocos vazios → layout padrão (sempre com banner no topo). */
export function normalizeLayoutBlocks(
  blocks: SmartHubLayoutBlock[] | undefined | null
): SmartHubLayoutBlock[] {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return [...DEFAULT_HUB_LAYOUT_BLOCKS];
  }
  return blocks;
}

/**
 * Garante bloco `banner` no topo sem remover demais blocos.
 * Usado na renderização pública/prévia para todos os templates.
 */
export function ensureBannerBlock(
  blocks: SmartHubLayoutBlock[] | undefined | null
): SmartHubLayoutBlock[] {
  const normalized = normalizeLayoutBlocks(blocks);
  if (normalized.includes('banner')) {
    // Move banner para o topo se estiver em outra posição
    if (normalized[0] === 'banner') return normalized;
    return ['banner', ...normalized.filter((b) => b !== 'banner')];
  }
  return ['banner', ...normalized];
}

import type { SmartHubButtonType, SmartHubClickAction } from '@/types/smartHub';

/** Texto único entre Tipo e Ação (não repetir em outros lugares). */
export const TYPE_ACTION_BRIDGE_HINT =
  'Tipo = o que o botão representa. Ação = o que acontecerá quando o visitante tocar nele.';

/** Ação recomendada ao escolher o tipo (quando o usuário ainda não alterou a ação). */
export const RECOMMENDED_ACTION_BY_TYPE: Record<SmartHubButtonType, SmartHubClickAction> = {
  whatsapp: 'whatsapp',
  phone: 'phone',
  email: 'email',
  map: 'map',
  instagram: 'link',
  facebook: 'link',
  tiktok: 'link',
  youtube: 'link',
  site: 'link',
  link: 'link',
  social: 'link',
  appointment: 'form',
  procedure: 'form',
  info: 'info',
  video: 'link',
  form: 'form',
  internal: 'link',
};

/**
 * Ações compatíveis por tipo.
 * Combinações fora desta lista só aparecem em “Configuração personalizada”.
 */
export const COMPATIBLE_ACTIONS_BY_TYPE: Record<SmartHubButtonType, SmartHubClickAction[]> = {
  whatsapp: ['whatsapp'],
  phone: ['phone'],
  email: ['email'],
  map: ['map'],
  instagram: ['link'],
  facebook: ['link'],
  tiktok: ['link'],
  youtube: ['link'],
  site: ['link'],
  link: ['link'],
  social: ['link'],
  appointment: ['form', 'whatsapp', 'link', 'booking'],
  procedure: ['form', 'whatsapp', 'link', 'info', 'booking'],
  info: ['info', 'link'],
  video: ['link'],
  form: ['form', 'whatsapp', 'link'],
  internal: ['link', 'info'],
};

export const ALL_CLICK_ACTIONS: SmartHubClickAction[] = [
  'auto',
  'form',
  'whatsapp',
  'link',
  'phone',
  'email',
  'map',
  'info',
  'booking',
];

export function getCompatibleActions(
  type: SmartHubButtonType,
  customUnlocked: boolean
): SmartHubClickAction[] {
  if (customUnlocked) return ALL_CLICK_ACTIONS;
  return COMPATIBLE_ACTIONS_BY_TYPE[type] || ['link'];
}

export function isActionCompatible(
  type: SmartHubButtonType,
  action: SmartHubClickAction
): boolean {
  if (action === 'auto') return true;
  const list = COMPATIBLE_ACTIONS_BY_TYPE[type] || [];
  return list.includes(action);
}

export function getRecommendedAction(type: SmartHubButtonType): SmartHubClickAction {
  return RECOMMENDED_ACTION_BY_TYPE[type] || 'link';
}

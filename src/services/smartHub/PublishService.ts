import type { SmartHub, SmartHubButton, SmartHubTheme } from '@/types/smartHub';
import { validateSlug } from './slugUtils';
import { hubRepository } from '@/repositories/smartHub';

/** Checklist local de prontidão (complementa SmartHubValidationResult do HubService). */
export interface PublishReadinessItem {
  id: string;
  label: string;
  ok: boolean;
  href?: string;
}

export interface PublishValidationResult {
  canPublish: boolean;
  items: PublishReadinessItem[];
}

export async function validatePublishReadiness(
  hub: SmartHub,
  buttons: SmartHubButton[],
  theme: SmartHubTheme | null
): Promise<PublishValidationResult> {
  const activeButtons = buttons.filter((b) => b.visible && b.status === 'active' && !b.deleted_at);

  const slugCheck = validateSlug(hub.slug);
  const slugAvailable = slugCheck.valid
    ? await hubRepository.isSlugAvailable(hub.slug, hub.id)
    : false;

  const items: PublishReadinessItem[] = [
    {
      id: 'title',
      label: 'Informe o nome público da clínica',
      ok: Boolean(hub.title?.trim()),
      href: '/smart-hub/configuracoes',
    },
    {
      id: 'slug',
      label: 'Defina um slug válido para a URL',
      ok: slugCheck.valid,
      href: '/smart-hub/configuracoes',
    },
    {
      id: 'slug_available',
      label: 'O slug precisa estar disponível',
      ok: slugAvailable,
      href: '/smart-hub/configuracoes',
    },
    {
      id: 'template',
      label: 'Escolha um template',
      ok: Boolean(hub.template_id),
      href: '/smart-hub/templates',
    },
    {
      id: 'buttons',
      label: 'Adicione pelo menos um botão ativo',
      ok: activeButtons.length > 0,
      href: '/smart-hub/botoes',
    },
    {
      id: 'theme',
      label: 'Configure o visual da página',
      ok: Boolean(theme),
      href: '/smart-hub/paginas',
    },
    {
      id: 'not_deleted',
      label: 'O Smart Hub precisa estar ativo',
      ok: !hub.deleted_at,
    },
  ];

  return {
    canPublish: items.every((i) => i.ok),
    items,
  };
}

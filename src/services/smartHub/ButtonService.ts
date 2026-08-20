import { buttonRepository } from '@/repositories/smartHub';
import type {
  ListQueryParams,
  PaginatedResult,
  SmartHubButton,
  SmartHubButtonInsert,
  SmartHubButtonUpdate,
  SmartHubClickAction,
} from '@/types/smartHub';
import { validateButtonInput } from './buttonUtils';

export const ButtonService = {
  listByHub(
    hubId: string,
    clinicId: string,
    params?: Omit<ListQueryParams, 'clinicId'>
  ): Promise<PaginatedResult<SmartHubButton>> {
    return buttonRepository.listByHub(hubId, clinicId, params);
  },

  create(
    payload: SmartHubButtonInsert,
    userId?: string | null
  ): Promise<SmartHubButton> {
    const check = validateButtonInput({
      title: payload.title,
      type: payload.type || 'link',
      url: payload.url,
      click_action: (payload.click_action as SmartHubClickAction | undefined) ?? null,
    });
    if (!check.valid) throw new Error(check.error);

    return buttonRepository.create({
      ...payload,
      created_by: userId ?? null,
      updated_by: userId ?? null,
    });
  },

  update(
    id: string,
    clinicId: string,
    payload: SmartHubButtonUpdate,
    userId?: string | null
  ): Promise<SmartHubButton> {
    if (payload.title !== undefined && !payload.title.trim()) {
      throw new Error('Informe o título do botão.');
    }
    if (payload.type && payload.url !== undefined) {
      const check = validateButtonInput({
        title: payload.title?.trim() || 'Botão',
        type: payload.type,
        url: payload.url,
        click_action: (payload.click_action as SmartHubClickAction | undefined) ?? null,
      });
      if (!check.valid) throw new Error(check.error);
    }

    return buttonRepository.update(id, clinicId, {
      ...payload,
      updated_by: userId ?? null,
    });
  },

  softDelete(id: string, clinicId: string, userId?: string | null): Promise<void> {
    return buttonRepository.softDelete(id, clinicId, userId);
  },

  reorder(
    clinicId: string,
    items: { id: string; order_index: number }[]
  ): Promise<void> {
    return buttonRepository.reorder(clinicId, items);
  },

  async duplicate(
    button: SmartHubButton,
    userId?: string | null
  ): Promise<SmartHubButton> {
    return this.create(
      {
        clinic_id: button.clinic_id,
        hub_id: button.hub_id,
        title: `${button.title} (cópia)`,
        subtitle: button.subtitle,
        icon: button.icon,
        type: button.type,
        url: button.url,
        image: button.image,
        background_color: button.background_color,
        text_color: button.text_color,
        visible: button.visible,
        order_index: button.order_index + 1,
        track_click: button.track_click,
        status: button.status,
        click_action: button.click_action,
        capture_config: button.capture_config,
        visual_variant: button.visual_variant,
        whatsapp_message: button.whatsapp_message,
        image_alt: button.image_alt,
      },
      userId
    );
  },
};

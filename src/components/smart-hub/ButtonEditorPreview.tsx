import { HubButton } from './HubButton';
import { resolveClickAction } from '@/services/smartHub/captureDefaults';
import {
  type SmartHubButton,
  type SmartHubButtonType,
  type SmartHubButtonVisualVariant,
  type SmartHubClickAction,
} from '@/types/smartHub';
import { cn } from '@/lib/utils';
import type { ButtonIntentId, ContactMethodId, SocialNetworkId } from './buttonIntentOptions';

export interface ButtonEditorPreviewModel {
  title: string;
  subtitle: string;
  type: SmartHubButtonType;
  click_action: SmartHubClickAction;
  visual_variant: SmartHubButtonVisualVariant;
  url: string;
  whatsapp_message: string;
  icon: string;
  image: string;
  image_alt: string;
  background_color: string;
  text_color: string;
  redirect_whatsapp?: boolean;
  email_subject?: string;
  open_in_new_tab?: boolean;
  interest?: string | null;
  stage_label?: string | null;
  owner_label?: string | null;
  has_owner?: boolean;
  show_crm_summary?: boolean;
  intent?: ButtonIntentId;
  social_network?: SocialNetworkId | null;
  contact_method?: ContactMethodId | null;
  form_source_label?: string | null;
  using_hub_form?: boolean;
}

interface ButtonEditorPreviewProps {
  model: ButtonEditorPreviewModel;
  className?: string;
  /** Na edição, mostra as cores escolhidas (mesmo com contraste ruim). */
  showActualColors?: boolean;
}

/** Prévia compacta do botão — sem painel lateral de configuração. */
export function ButtonEditorPreview({
  model,
  className,
  showActualColors = true,
}: ButtonEditorPreviewProps) {
  const action = resolveClickAction(model.click_action, model.type);
  void action;

  const previewButton = {
    id: 'preview-button',
    clinic_id: '',
    hub_id: '',
    title: model.title.trim() || 'Título do botão',
    subtitle: model.subtitle.trim() || null,
    icon: model.icon || null,
    type: model.type,
    url: model.url || '#',
    image: model.image || null,
    image_alt: model.image_alt || null,
    visual_variant: model.visual_variant,
    image_position: 'left',
    whatsapp_message: model.whatsapp_message || null,
    click_action: model.click_action,
    capture_config: {
      email_subject: model.email_subject || null,
      open_in_new_tab: model.open_in_new_tab,
    },
    background_color: model.background_color || '#0F766E',
    text_color: model.text_color || '#FFFFFF',
    visible: true,
    order_index: 0,
    track_click: true,
    status: 'active',
    created_at: '',
    updated_at: '',
    created_by: null,
    updated_by: null,
    deleted_at: null,
  } as SmartHubButton;

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-xs font-medium text-muted-foreground">Prévia</p>
      <div className="rounded-xl border bg-muted/30 p-3">
        <div className="mx-auto max-w-[280px]">
          <HubButton
            button={previewButton}
            onClick={() => undefined}
            defaultBg={model.background_color || '#0F766E'}
            defaultFg={model.text_color || '#FFFFFF'}
            autoFixContrast={!showActualColors}
          />
        </div>
      </div>
    </div>
  );
}

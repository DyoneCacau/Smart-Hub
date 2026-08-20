import { HubPublicView } from '@/components/smart-hub/HubPublicView';
import type { SmartHub, SmartHubButton, SmartHubTheme } from '@/types/smartHub';
import { cn } from '@/lib/utils';

export type PreviewDevice = 'mobile' | 'tablet' | 'desktop';

interface HubPublicRendererProps {
  hub: SmartHub;
  theme?: SmartHubTheme | null;
  buttons: SmartHubButton[];
  /** Mantido por compatibilidade com o WIP; o layout vem de hub.layout_blocks / visual_config. */
  templateKey?: string;
  onButtonClick?: (button: SmartHubButton, href: string | null) => void;
  preview?: boolean;
  device?: PreviewDevice;
  className?: string;
}

function deviceFrameClass(device?: PreviewDevice): string {
  if (device === 'mobile') return 'max-w-[390px]';
  if (device === 'tablet') return 'max-w-[768px]';
  return 'max-w-full';
}

/**
 * Prévia contextual com moldura de dispositivo.
 * Delega a renderização pública a HubPublicView (contratos atuais do Smart Hub).
 */
export function HubPublicRenderer({
  hub,
  theme = null,
  buttons,
  onButtonClick,
  preview = false,
  device,
  className,
}: HubPublicRendererProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full',
        preview && 'overflow-hidden rounded-2xl border shadow-sm',
        deviceFrameClass(device),
        className
      )}
    >
      <HubPublicView
        payload={{
          hub,
          theme,
          buttons,
          page: null,
          assets: [],
          preview,
        }}
        preview={preview}
        onButtonClick={
          onButtonClick
            ? (button) => onButtonClick(button, button.url ?? null)
            : undefined
        }
      />
    </div>
  );
}

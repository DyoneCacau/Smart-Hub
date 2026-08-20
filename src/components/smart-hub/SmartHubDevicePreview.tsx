import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SmartHubPreviewDevice = 'mobile' | 'tablet' | 'desktop';

interface SmartHubDevicePreviewProps {
  device: SmartHubPreviewDevice;
  children: ReactNode;
  className?: string;
}

const DEVICE_WIDTH: Record<SmartHubPreviewDevice, string> = {
  mobile: 'w-[min(100%,390px)]',
  tablet: 'w-[min(100%,440px)]',
  desktop: 'w-[min(100%,460px)]',
};

/**
 * Frame visual da prévia (celular / tablet / desktop reduzido).
 * O conteúdo interno rola independentemente da página admin.
 */
export function SmartHubDevicePreview({
  device,
  children,
  className,
}: SmartHubDevicePreviewProps) {
  const isPhone = device === 'mobile';

  return (
    <div className={cn('mx-auto', DEVICE_WIDTH[device], className)}>
      <div
        className={cn(
          'overflow-hidden bg-slate-950 shadow-xl',
          isPhone
            ? 'rounded-[1.75rem] border-[8px] border-slate-900'
            : 'rounded-xl border border-slate-300 bg-slate-200 p-2'
        )}
      >
        {isPhone && (
          <div className="relative flex h-6 items-end justify-center bg-slate-950 pb-1">
            <div className="h-1.5 w-16 rounded-full bg-slate-700" aria-hidden />
          </div>
        )}

        <div
          className={cn(
            'overflow-y-auto overscroll-contain bg-background',
            isPhone
              ? 'max-h-[min(720px,calc(100vh-11rem))]'
              : 'max-h-[min(760px,calc(100vh-10rem))] rounded-lg'
          )}
        >
          {children}
        </div>

        {isPhone && (
          <div className="flex h-4 items-center justify-center bg-slate-950" aria-hidden>
            <div className="h-1 w-10 rounded-full bg-slate-700" />
          </div>
        )}
      </div>
    </div>
  );
}

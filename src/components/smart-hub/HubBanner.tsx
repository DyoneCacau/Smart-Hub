import { memo } from 'react';
import { cn } from '@/lib/utils';

interface HubBannerProps {
  src?: string | null;
  alt?: string;
  className?: string;
  /** Cor principal do hub (identidade visual). */
  primaryColor?: string;
  /** Cor secundária para o gradiente do placeholder. */
  secondaryColor?: string;
  /** Em prévia autenticada, sugere upload quando não há imagem. */
  showUploadHint?: boolean;
}

export const HubBanner = memo(function HubBanner({
  src,
  alt = 'Banner da clínica',
  className,
  primaryColor = '#0F766E',
  secondaryColor = '#134E4A',
  showUploadHint = false,
}: HubBannerProps) {
  if (!src) {
    return (
      <div
        className={cn('w-full overflow-hidden', className)}
        role="img"
        aria-label={alt}
      >
        <div
          className="relative flex h-40 w-full items-end justify-start sm:h-52 md:h-64"
          style={{
            background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.35), transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.2), transparent 40%)',
            }}
          />
          {showUploadHint ? (
            <p className="relative z-[1] px-4 pb-4 text-sm font-medium text-white/95 drop-shadow-sm">
              Adicione um banner em Configurações
            </p>
          ) : (
            <span className="sr-only">{alt}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('w-full overflow-hidden', className)}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-40 w-full object-cover sm:h-52 md:h-64"
      />
    </div>
  );
});

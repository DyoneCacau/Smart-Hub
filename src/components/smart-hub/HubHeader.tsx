import { memo } from 'react';
import { cn } from '@/lib/utils';
import { HubLogo } from './HubLogo';

interface HubHeaderProps {
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  showLogo?: boolean;
  primaryColor?: string;
  className?: string;
}

export const HubHeader = memo(function HubHeader({
  title,
  subtitle,
  description,
  logoUrl,
  showLogo = true,
  primaryColor,
  className,
}: HubHeaderProps) {
  if (!title && !subtitle && !description && !(showLogo && logoUrl)) return null;

  return (
    <header className={cn('space-y-3 px-4 text-center', className)}>
      {showLogo && <HubLogo src={logoUrl} alt={title || 'Logo'} />}
      <div className="space-y-1">
        {title && (
          <h1
            className="text-2xl font-bold tracking-tight sm:text-3xl"
            style={{ color: primaryColor }}
          >
            {title}
          </h1>
        )}
        {subtitle && <p className="text-base text-muted-foreground sm:text-lg">{subtitle}</p>}
        {description && (
          <p className="mx-auto max-w-xl text-sm text-muted-foreground sm:text-base">{description}</p>
        )}
      </div>
    </header>
  );
});

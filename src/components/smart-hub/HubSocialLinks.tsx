import { memo } from 'react';
import { cn } from '@/lib/utils';

export interface HubSocialLink {
  label: string;
  url: string;
  icon?: string;
}

interface HubSocialLinksProps {
  links: HubSocialLink[];
  className?: string;
}

export const HubSocialLinks = memo(function HubSocialLinks({
  links,
  className,
}: HubSocialLinksProps) {
  if (!links.length) return null;

  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-3 px-4', className)}>
      {links.map((link) => (
        <a
          key={`${link.label}-${link.url}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${link.label} (abre em nova aba)`}
          className="rounded-full border px-3 py-1.5 text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {link.label}
        </a>
      ))}
    </div>
  );
});

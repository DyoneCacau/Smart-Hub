import { memo } from 'react';
import { cn } from '@/lib/utils';

interface HubVideoProps {
  url?: string | null;
  title?: string;
  className?: string;
}

function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      const id = u.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.includes('youtu.be')) {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    return url;
  } catch {
    return null;
  }
}

export const HubVideo = memo(function HubVideo({ url, title = 'Vídeo', className }: HubVideoProps) {
  if (!url) return null;
  const embed = toEmbedUrl(url);
  if (!embed) return null;

  return (
    <div className={cn('mx-auto w-full max-w-lg px-4', className)}>
      <div className="aspect-video overflow-hidden rounded-xl border bg-black">
        <iframe
          src={embed}
          title={title}
          className="h-full w-full"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
});

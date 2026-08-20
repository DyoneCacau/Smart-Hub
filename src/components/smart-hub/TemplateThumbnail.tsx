import { cn } from '@/lib/utils';

interface TemplateThumbnailProps {
  name: string;
  style?: string;
  banner?: boolean;
  profile?: boolean;
  whatsapp?: boolean;
  grid?: boolean;
  className?: string;
  primary?: string;
  secondary?: string;
}

/** Miniatura ilustrativa do template (sem dados reais de clínicas). */
export function TemplateThumbnail({
  name,
  style = 'classic',
  banner = true,
  profile = true,
  whatsapp = false,
  grid = false,
  className,
  primary = '#0F766E',
  secondary = '#134E4A',
}: TemplateThumbnailProps) {
  return (
    <div
      className={cn(
        'relative flex h-36 flex-col overflow-hidden rounded-md border bg-gradient-to-b from-slate-50 to-white p-3',
        className
      )}
      aria-hidden
    >
      {banner && (
        <div
          className="mb-2 h-10 w-full rounded-sm opacity-90"
          style={{ background: `linear-gradient(90deg, ${primary}, ${secondary})` }}
        />
      )}
      <div className="mx-auto flex w-full max-w-[70%] flex-col items-center gap-1.5">
        {profile && (
          <div
            className={cn('h-8 w-8 rounded-full border-2 border-white shadow-sm', banner && '-mt-5')}
            style={{ backgroundColor: primary }}
          />
        )}
        <div className="h-2 w-20 rounded bg-slate-300" />
        <div className="h-1.5 w-14 rounded bg-slate-200" />
        {whatsapp && (
          <div className="mt-1 h-5 w-full rounded-full bg-emerald-500/90" />
        )}
        {grid ? (
          <div className="mt-1 grid w-full grid-cols-2 gap-1">
            <div className="h-6 rounded" style={{ backgroundColor: `${primary}33` }} />
            <div className="h-6 rounded" style={{ backgroundColor: `${secondary}33` }} />
            <div className="h-6 rounded" style={{ backgroundColor: `${secondary}33` }} />
            <div className="h-6 rounded" style={{ backgroundColor: `${primary}33` }} />
          </div>
        ) : (
          <div className="mt-1 flex w-full flex-col gap-1">
            <div className="h-4 w-full rounded" style={{ backgroundColor: `${primary}40` }} />
            <div className="h-4 w-full rounded" style={{ backgroundColor: `${primary}28` }} />
          </div>
        )}
      </div>
      <span className="sr-only">Prévia do template {name} ({style})</span>
    </div>
  );
}

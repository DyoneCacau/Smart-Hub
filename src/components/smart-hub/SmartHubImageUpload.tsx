import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { ImagePlus, Loader2, Trash2, Replace } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { SmartHubAssetKind } from '@/types/smartHub';
import { SMART_HUB_IMAGE_LIMITS, validateSmartHubImage } from '@/services/smartHub/imageUtils';

export interface SmartHubImageUploadProps {
  kind: SmartHubAssetKind;
  currentUrl?: string | null;
  clinicId: string;
  hubId: string;
  disabled?: boolean;
  className?: string;
  onUpload: (file: File) => Promise<string | void>;
  onRemove?: () => Promise<void> | void;
}

export function SmartHubImageUpload({
  kind,
  currentUrl,
  disabled,
  className,
  onUpload,
  onRemove,
}: SmartHubImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = SMART_HUB_IMAGE_LIMITS[kind];
  const isBanner = kind === 'banner' || kind === 'background';

  const runUpload = async (file: File) => {
    setError(null);
    const check = validateSmartHubImage(file, kind);
    if (check.ok === false) {
      setError(check.message);
      return;
    }

    setUploading(true);
    setProgress(12);
    const timer = window.setInterval(() => {
      setProgress((p) => (p >= 88 ? p : p + 8));
    }, 180);

    try {
      await onUpload(file);
      setProgress(100);
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Não foi possível enviar a imagem.';
      setError(message);
    } finally {
      window.clearInterval(timer);
      setUploading(false);
      setTimeout(() => setProgress(0), 400);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void runUpload(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void runUpload(file);
  };

  const openPicker = () => inputRef.current?.click();

  return (
    <div
      className={cn(
        'space-y-2',
        isBanner ? 'w-full max-w-xl' : 'w-full max-w-[240px]',
        className
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={currentUrl ? `Visualizar ${meta.label}` : `Enviar ${meta.label}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => {
          if (!currentUrl && !uploading && !disabled) openPicker();
        }}
        className={cn(
          'relative overflow-hidden rounded-xl border bg-muted/40 transition',
          isBanner ? 'aspect-[16/9] w-full' : 'aspect-square w-full',
          !currentUrl && 'border-dashed',
          dragging && 'border-primary bg-primary/5',
          (disabled || uploading) && 'pointer-events-none opacity-70'
        )}
      >
        {currentUrl ? (
          <>
            <img
              src={currentUrl}
              alt={meta.label}
              className={cn(
                'h-full w-full',
                isBanner ? 'object-cover' : 'object-cover'
              )}
            />
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-1.5 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-2 pt-8">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 bg-white/95 text-foreground hover:bg-white"
                disabled={disabled || uploading}
                onClick={(e) => {
                  e.stopPropagation();
                  openPicker();
                }}
              >
                {uploading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Replace className="mr-1.5 h-3.5 w-3.5" />
                )}
                Substituir
              </Button>
              {onRemove && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 bg-white/95 text-foreground hover:bg-white"
                  disabled={disabled || uploading}
                  onClick={(e) => {
                    e.stopPropagation();
                    void onRemove();
                  }}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Remover
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 px-3 text-center text-xs text-muted-foreground sm:text-sm">
            <ImagePlus className="h-5 w-5 sm:h-6 sm:w-6" />
            <span className="font-medium text-foreground/80">Enviar {meta.label.toLowerCase()}</span>
            <span className="leading-snug">
              {meta.aspectHint} · até {Math.round(meta.maxBytes / (1024 * 1024))} MB
            </span>
            <span className="hidden text-[11px] sm:inline">Arraste ou toque para selecionar</span>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-x-0 bottom-0 bg-background/85 p-2">
            <Progress value={progress} className="h-1.5" />
          </div>
        )}
      </div>

      {!currentUrl && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="w-full"
          disabled={disabled || uploading}
          onClick={openPicker}
        >
          {uploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="mr-2 h-4 w-4" />
          )}
          Selecionar arquivo
        </Button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}

import { useMemo, useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { CaptureService, resolveCaptureConfig } from '@/services/smartHub';
import type { SmartHub, SmartHubButton } from '@/types/smartHub';
import { cn } from '@/lib/utils';

interface HubCaptureFormProps {
  hub: SmartHub;
  button?: SmartHubButton | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview?: boolean;
  className?: string;
}

function utmFromLocation(): Record<string, string | null> {
  if (typeof window === 'undefined') {
    return {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
    };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
    utm_content: params.get('utm_content'),
    utm_term: params.get('utm_term'),
  };
}

export function HubCaptureForm({
  hub,
  button,
  open,
  onOpenChange,
  preview = false,
  className,
}: HubCaptureFormProps) {
  const config = useMemo(
    () => resolveCaptureConfig(hub.capture_config, button?.capture_config),
    [hub.capture_config, button?.capture_config]
  );

  const fields = useMemo(
    () =>
      [...(config.fields || [])]
        .filter((f) => f.visible)
        .sort((a, b) => a.order - b.order),
    [config.fields]
  );

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [interest, setInterest] = useState(config.interest || '');
  const [message, setMessage] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setPhone('');
    setEmail('');
    setInterest(config.interest || '');
    setMessage('');
    setPreferredTime('');
    setPreferredDate('');
    setPrivacyAccepted(false);
    setHoneypot('');
    setFieldError(null);
    setRequestId(null);
    setSuccess(null);
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      if (submitting) return;
      reset();
    }
    onOpenChange(next);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFieldError(null);
    setRequestId(null);

    if (!name.trim()) {
      setFieldError('Informe seu nome.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      setFieldError('Informe um WhatsApp válido.');
      return;
    }
    if (config.require_privacy_accept && !privacyAccepted) {
      setFieldError('Autorize o uso dos dados para continuar.');
      return;
    }

    if (preview) {
      setSuccess('Prévia — o envio real só ocorre na página publicada.');
      return;
    }

    setSubmitting(true);
    try {
      const utm = utmFromLocation();
      const result = await CaptureService.submitPublicForm({
        slug: hub.slug,
        button_id: button?.id?.startsWith('hub-') ? null : button?.id,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        interest: interest.trim() || undefined,
        message: message.trim() || undefined,
        preferred_time: preferredTime.trim() || undefined,
        preferred_date: preferredDate.trim() || undefined,
        privacy_accepted: privacyAccepted,
        referrer: typeof document !== 'undefined' ? document.referrer : undefined,
        landing_url: typeof window !== 'undefined' ? window.location.href : undefined,
        device_type:
          typeof window !== 'undefined'
            ? window.innerWidth < 768
              ? 'mobile'
              : window.innerWidth < 1024
                ? 'tablet'
                : 'desktop'
            : 'unknown',
        website: honeypot,
        ...utm,
      });

      if (!result.ok) {
        setFieldError(result.error || 'Não foi possível enviar agora. Tente novamente.');
        setRequestId(result.request_id || null);
        return;
      }

      setSuccess(result.message || 'Recebemos seus dados.');
      setFieldError(null);
      setRequestId(null);

      const waUrl = result.whatsapp_url;
      const redirect = result.redirect_url;

      window.setTimeout(() => {
        reset();
        onOpenChange(false);
        if (waUrl) {
          try {
            window.open(waUrl, '_blank', 'noopener,noreferrer');
          } catch {
            /* redirecionamento não invalida o lead já salvo */
          }
        } else if (redirect) {
          try {
            window.location.href = redirect;
          } catch {
            /* ignore */
          }
        }
      }, 600);
    } catch {
      setFieldError('Não foi possível conectar. Verifique sua internet e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const formBody = (
    <form onSubmit={onSubmit} className={cn('space-y-4', className)} noValidate>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{config.form_title || 'Fale conosco'}</h3>
        {config.form_description && (
          <p className="text-sm text-muted-foreground">{config.form_description}</p>
        )}
      </div>

      <div className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden" aria-hidden>
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      {fields.map((field) => {
        if (field.key === 'privacy') {
          return (
            <div key={field.key} className="flex items-start gap-2">
              <Checkbox
                id="privacy"
                checked={privacyAccepted}
                disabled={submitting || Boolean(success)}
                onCheckedChange={(v) => setPrivacyAccepted(Boolean(v))}
              />
              <Label htmlFor="privacy" className="text-sm font-normal leading-snug">
                {field.label || config.privacy_text}
                {config.privacy_url && (
                  <>
                    {' '}
                    <a
                      href={config.privacy_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Política de Privacidade
                    </a>
                  </>
                )}
              </Label>
            </div>
          );
        }

        if (field.key === 'message') {
          return (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={field.key}>
                {field.label}
                {field.required ? ' *' : ''}
              </Label>
              <Textarea
                id={field.key}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={field.placeholder}
                rows={3}
                required={field.required}
                disabled={submitting || Boolean(success)}
              />
            </div>
          );
        }

        const valueMap: Record<string, { value: string; set: (v: string) => void }> = {
          name: { value: name, set: setName },
          whatsapp: { value: phone, set: setPhone },
          email: { value: email, set: setEmail },
          interest: { value: interest, set: setInterest },
          preferred_time: { value: preferredTime, set: setPreferredTime },
          preferred_date: { value: preferredDate, set: setPreferredDate },
        };
        const ctrl = valueMap[field.key];
        if (!ctrl) return null;

        return (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={field.key}>
              {field.label}
              {field.required ? ' *' : ''}
            </Label>
            <Input
              id={field.key}
              type={field.key === 'email' ? 'email' : field.key === 'preferred_date' ? 'date' : 'text'}
              value={ctrl.value}
              onChange={(e) => ctrl.set(e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              disabled={submitting || Boolean(success)}
              inputMode={field.key === 'whatsapp' ? 'tel' : undefined}
              autoComplete={
                field.key === 'name'
                  ? 'name'
                  : field.key === 'whatsapp'
                    ? 'tel'
                    : field.key === 'email'
                      ? 'email'
                      : undefined
              }
            />
          </div>
        );
      })}

      {fieldError && (
        <div className="space-y-1">
          <p className="text-sm text-destructive">{fieldError}</p>
          {requestId ? (
            <p className="text-[11px] text-muted-foreground">
              Código de atendimento: {requestId}
            </p>
          ) : null}
        </div>
      )}
      {success && <p className="text-sm text-emerald-700">{success}</p>}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="submit"
          disabled={submitting || Boolean(success)}
          className="min-h-[44px] flex-1"
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitting ? 'Enviando...' : config.submit_label || 'Enviar'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px]"
          disabled={submitting}
          onClick={() => handleClose(false)}
        >
          <X className="mr-1 h-4 w-4" />
          Fechar
        </Button>
      </div>
    </form>
  );

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-lg"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{config.form_title || 'Formulário'}</SheetTitle>
        </SheetHeader>
        <div className="relative mt-2 pb-4">{formBody}</div>
      </SheetContent>
    </Sheet>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import type { CaptureField } from '@/lib/captureFormPresets';

interface PublicForm {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  submit_label: string;
  success_message: string;
  fields: CaptureField[];
}

function getTrackingId(key: string) {
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

function paramsFromLocation() {
  const query = new URLSearchParams(window.location.search);
  return {
    utmSource: query.get('utm_source'),
    utmMedium: query.get('utm_medium'),
    utmCampaign: query.get('utm_campaign'),
    utmContent: query.get('utm_content'),
    utmTerm: query.get('utm_term'),
  };
}

export default function PublicCaptureForm() {
  const { slug } = useParams();
  const [form, setForm] = useState<PublicForm | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const visitorId = useMemo(() => getTrackingId('funnelVisitorId'), []);
  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const attribution = useMemo(() => paramsFromLocation(), []);

  useEffect(() => {
    if (!slug) return;
    void (async () => {
      const { data, error: formError } = await (supabase as any)
        .from('capture_forms')
        .select('id,slug,title,description,submit_label,success_message,fields')
        .eq('slug', slug)
        .eq('is_published', true)
        .maybeSingle();

      if (formError || !data) {
        setError('Este formulário não está disponível.');
        setLoading(false);
        return;
      }
      setForm({ ...data, fields: Array.isArray(data.fields) ? data.fields : [] });
      setLoading(false);

      await (supabase as any).rpc('track_public_capture_event', {
        p_slug: slug,
        p_event_name: 'form_view',
        p_visitor_id: visitorId,
        p_session_id: sessionId,
        p_utm_source: attribution.utmSource,
        p_utm_medium: attribution.utmMedium,
        p_utm_campaign: attribution.utmCampaign,
        p_properties: { referrer: document.referrer || null, path: window.location.pathname },
      });
    })();
  }, [slug, visitorId, sessionId, attribution]);

  const markStarted = async () => {
    if (!slug || startedRef.current) return;
    startedRef.current = true;
    await (supabase as any).rpc('track_public_capture_event', {
      p_slug: slug,
      p_event_name: 'form_started',
      p_visitor_id: visitorId,
      p_session_id: sessionId,
      p_utm_source: attribution.utmSource,
      p_utm_medium: attribution.utmMedium,
      p_utm_campaign: attribution.utmCampaign,
      p_properties: {},
    });
  };

  const submit = async () => {
    if (!slug || !form) return;
    const missing = form.fields.find((field) => field.required && !answers[field.key]?.trim());
    if (missing) {
      setError(`Preencha: ${missing.label}`);
      return;
    }

    setSubmitting(true);
    setError(null);
    const { data, error: submitError } = await (supabase as any).rpc('submit_public_capture_form', {
      p_slug: slug,
      p_answers: answers,
      p_visitor_id: visitorId,
      p_session_id: sessionId,
      p_utm_source: attribution.utmSource,
      p_utm_medium: attribution.utmMedium,
      p_utm_campaign: attribution.utmCampaign,
      p_utm_content: attribution.utmContent,
      p_utm_term: attribution.utmTerm,
      p_referrer: document.referrer || null,
    });
    setSubmitting(false);

    if (submitError) {
      console.error(submitError);
      setError('Não foi possível enviar agora. Tente novamente.');
      return;
    }
    setSuccessMessage(data?.success_message || form.success_message);
  };

  if (loading) return <div className="mx-auto max-w-2xl p-6 text-center text-muted-foreground">Carregando...</div>;
  if (!form) return <div className="mx-auto max-w-2xl p-6 text-center text-muted-foreground">{error}</div>;

  if (successMessage) {
    return (
      <div className="min-h-screen bg-muted/30 px-4 py-12">
        <Card className="mx-auto max-w-xl">
          <CardContent className="space-y-4 py-12 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="text-2xl font-bold">Informações recebidas</h1>
            <p className="text-muted-foreground">{successMessage}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8 sm:py-12">
      <Card className="mx-auto max-w-2xl shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl sm:text-3xl">{form.title}</CardTitle>
          {form.description && <p className="text-muted-foreground">{form.description}</p>}
        </CardHeader>
        <CardContent className="space-y-6">
          {form.fields.map((field) => (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={field.id}>{field.label}{field.required ? ' *' : ''}</Label>
              {field.type === 'textarea' ? (
                <Textarea
                  id={field.id}
                  value={answers[field.key] || ''}
                  placeholder={field.placeholder}
                  rows={4}
                  onFocus={() => void markStarted()}
                  onChange={(event) => setAnswers((current) => ({ ...current, [field.key]: event.target.value }))}
                />
              ) : field.type === 'single_choice' ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(field.options || []).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        void markStarted();
                        setAnswers((current) => ({ ...current, [field.key]: option.value }));
                      }}
                      className={`rounded-lg border p-3 text-left text-sm transition ${answers[field.key] === option.value ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <Input
                  id={field.id}
                  type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                  value={answers[field.key] || ''}
                  placeholder={field.placeholder}
                  onFocus={() => void markStarted()}
                  onChange={(event) => setAnswers((current) => ({ ...current, [field.key]: event.target.value }))}
                />
              )}
            </div>
          ))}

          {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

          <Button className="w-full" size="lg" onClick={() => void submit()} disabled={submitting}>
            {submitting ? 'Enviando...' : form.submit_label}
          </Button>
          <p className="text-center text-xs text-muted-foreground">Ao enviar, suas informações serão usadas para dar continuidade ao atendimento solicitado.</p>
        </CardContent>
      </Card>
    </div>
  );
}

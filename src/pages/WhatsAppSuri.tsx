import { useState } from 'react';
import { AlertTriangle, BellRing, CalendarCheck, Clock, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SuriSetupGuide } from '@/components/whatsapp/SuriSetupGuide';
import { WhatsAppHistoryCard } from '@/components/whatsapp/WhatsAppHistoryCard';
import {
  DEFAULT_WHATSAPP_SETTINGS,
  useWhatsAppSettings,
  type WhatsAppMessageKind,
  type WhatsAppSettings,
} from '@/hooks/useWhatsAppSettings';
import { isSupabaseConfigured } from '@/integrations/supabase/client';
import { formatPhoneMaskBr } from '@/services/smartHub/BookingService';

const HOURS_BEFORE_OPTIONS = [1, 2, 3, 4, 6, 8, 12];
const URL_PATTERN = /^https:\/\/\S+$/;

const URL_FIELD: Record<
  WhatsAppMessageKind,
  'booking_webhook_url' | 'day_before_webhook_url' | 'same_day_webhook_url'
> = {
  booking: 'booking_webhook_url',
  day_before: 'day_before_webhook_url',
  same_day: 'same_day_webhook_url',
};

const ENABLED_FIELD: Record<WhatsAppMessageKind, 'booking_enabled' | 'day_before_enabled' | 'same_day_enabled'> = {
  booking: 'booking_enabled',
  day_before: 'day_before_enabled',
  same_day: 'same_day_enabled',
};

const MESSAGE_TITLES: Record<WhatsAppMessageKind, string> = {
  booking: 'Confirmação do agendamento',
  day_before: 'Lembrete na véspera',
  same_day: 'Lembrete no dia',
};

export default function WhatsAppSuri() {
  const { settings, isLoading, setupMissing, loadError, history, historyLoading, saveSettings, sendTest, refreshHistory } =
    useWhatsAppSettings();

  if (!isSupabaseConfigured) {
    return (
      <AppLayout title="WhatsApp (Suri)" description="Confirmações e lembretes automáticos pelo número da clínica">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Os envios automáticos rodam no servidor e só funcionam com o app conectado ao Supabase.
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  if (setupMissing) {
    return (
      <AppLayout title="WhatsApp (Suri)" description="Confirmações e lembretes automáticos pelo número da clínica">
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex items-start gap-3 p-6 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="font-medium text-amber-900">Falta atualizar o banco de dados</p>
              <p className="text-amber-800">
                Abra o SQL Editor do Supabase, cole o conteúdo de{' '}
                <code className="font-mono">supabase/ATUALIZACAO_02_WHATSAPP_SURI.sql</code> e clique em Run. Depois
                recarregue esta página.
              </p>
            </div>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout title="WhatsApp (Suri)" description="Confirmações e lembretes automáticos pelo número da clínica">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </AppLayout>
    );
  }

  if (loadError) {
    return (
      <AppLayout title="WhatsApp (Suri)" description="Confirmações e lembretes automáticos pelo número da clínica">
        <p className="text-sm text-destructive">Não foi possível carregar a configuração. Recarregue a página.</p>
      </AppLayout>
    );
  }

  return (
    <WhatsAppSuriForm
      initial={settings ?? DEFAULT_WHATSAPP_SETTINGS}
      history={history}
      historyLoading={historyLoading}
      onSave={saveSettings}
      onTest={sendTest}
      onRefreshHistory={refreshHistory}
    />
  );
}

interface WhatsAppSuriFormProps {
  initial: WhatsAppSettings;
  history: ReturnType<typeof useWhatsAppSettings>['history'];
  historyLoading: boolean;
  onSave: (next: WhatsAppSettings) => Promise<void>;
  onTest: (kind: WhatsAppMessageKind, phone: string) => Promise<{ ok: boolean; mensagem: string }>;
  onRefreshHistory: () => Promise<void>;
}

function WhatsAppSuriForm({ initial, history, historyLoading, onSave, onTest, onRefreshHistory }: WhatsAppSuriFormProps) {
  const [form, setForm] = useState<WhatsAppSettings>(initial);
  const [saved, setSaved] = useState<WhatsAppSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState<WhatsAppMessageKind | null>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const update = <K extends keyof WhatsAppSettings>(key: K, value: WhatsAppSettings[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const normalized = (next: WhatsAppSettings): WhatsAppSettings => ({
    ...next,
    booking_webhook_url: next.booking_webhook_url?.trim() || null,
    day_before_webhook_url: next.day_before_webhook_url?.trim() || null,
    same_day_webhook_url: next.same_day_webhook_url?.trim() || null,
  });

  const validate = (next: WhatsAppSettings): string | null => {
    for (const kind of Object.keys(URL_FIELD) as WhatsAppMessageKind[]) {
      const url = next[URL_FIELD[kind]];
      if (url && !URL_PATTERN.test(url)) {
        return `${MESSAGE_TITLES[kind]}: a URL do webhook precisa começar com https://`;
      }
      if (next.is_active && next[ENABLED_FIELD[kind]] && !url) {
        return `${MESSAGE_TITLES[kind]}: cole a URL do webhook da Suri ou desligue esta mensagem.`;
      }
    }
    return null;
  };

  const handleSave = async () => {
    const next = normalized(form);
    const problem = validate(next);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setForm(next);
      setSaved(next);
      toast.success(next.is_active ? 'Envios automáticos ativados' : 'Configuração salva');
    } catch {
      toast.error('Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (kind: WhatsAppMessageKind) => {
    if (testPhone.replace(/\D/g, '').length < 10) {
      toast.error('Informe o telefone para testes (com DDD).');
      return;
    }
    const url = form[URL_FIELD[kind]]?.trim();
    if (!url) {
      toast.error('Cole a URL do webhook desta mensagem antes de testar.');
      return;
    }
    if (dirty) {
      toast.error('Salve as alterações antes de testar.');
      return;
    }
    setTesting(kind);
    try {
      const result = await onTest(kind, testPhone);
      if (result.ok) toast.success(`${result.mensagem} Confira o WhatsApp em alguns segundos.`);
      else toast.error(result.mensagem);
    } catch {
      toast.error('Não foi possível enviar o teste.');
    } finally {
      setTesting(null);
    }
  };

  const testButton = (kind: WhatsAppMessageKind) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void handleTest(kind)}
      disabled={testing !== null}
    >
      {testing === kind ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
      Enviar teste
    </Button>
  );

  const urlInput = (kind: WhatsAppMessageKind) => {
    const field = URL_FIELD[kind];
    const id = `webhook-${kind}`;
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>URL do webhook (gatilho do fluxo na Suri)</Label>
        <Input
          id={id}
          type="url"
          inputMode="url"
          placeholder="https://….azurewebsites.net/flow/hook?type=1000&channelId=…&flowId=…"
          value={form[field] ?? ''}
          onChange={(e) => update(field, e.target.value)}
          className="font-mono text-xs"
        />
      </div>
    );
  };

  return (
    <AppLayout
      title="WhatsApp (Suri)"
      description="Confirmações e lembretes automáticos pelo número da clínica"
      actions={
        <Button onClick={() => void handleSave()} disabled={saving || !dirty}>
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold">Envios automáticos</p>
                <Badge
                  variant="outline"
                  className={
                    saved.is_active
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-muted bg-muted text-muted-foreground'
                  }
                >
                  {saved.is_active ? 'Ativo' : 'Desligado'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                O SmartHub chama o fluxo da Suri e a Suri envia a mensagem pelo WhatsApp conectado nela. Vale para
                consultas criadas no Smart Hub e na Agenda.
              </p>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={(checked) => update('is_active', checked)}
              aria-label="Ativar envios automáticos"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="text-lg">Mensagens</CardTitle>
              <CardDescription>Cada mensagem chama o webhook de um fluxo da Suri.</CardDescription>
            </div>
            <div className="w-full space-y-1.5 sm:w-56">
              <Label htmlFor="test-phone">Telefone para testes</Label>
              <Input
                id="test-phone"
                type="tel"
                inputMode="tel"
                placeholder="(11) 99999-9999"
                value={testPhone}
                onChange={(e) => setTestPhone(formatPhoneMaskBr(e.target.value))}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <MessageBlock
              icon={<CalendarCheck className="h-5 w-5" />}
              title={MESSAGE_TITLES.booking}
              description="Enviada logo depois que a consulta é criada."
              enabled={form.booking_enabled}
              onEnabledChange={(v) => update('booking_enabled', v)}
              action={testButton('booking')}
            >
              {urlInput('booking')}
            </MessageBlock>

            <MessageBlock
              icon={<BellRing className="h-5 w-5" />}
              title={MESSAGE_TITLES.day_before}
              description="Enviada no dia anterior à consulta, a partir do horário escolhido."
              enabled={form.day_before_enabled}
              onEnabledChange={(v) => update('day_before_enabled', v)}
              action={testButton('day_before')}
            >
              <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                <div className="space-y-1.5">
                  <Label htmlFor="day-before-time">Enviar a partir de</Label>
                  <Input
                    id="day-before-time"
                    type="time"
                    value={form.day_before_time}
                    onChange={(e) => update('day_before_time', e.target.value || '18:00')}
                  />
                </div>
                {urlInput('day_before')}
              </div>
            </MessageBlock>

            <MessageBlock
              icon={<Clock className="h-5 w-5" />}
              title={MESSAGE_TITLES.same_day}
              description="Enviada no dia da consulta, algumas horas antes do horário."
              enabled={form.same_day_enabled}
              onEnabledChange={(v) => update('same_day_enabled', v)}
              action={testButton('same_day')}
            >
              <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                <div className="space-y-1.5">
                  <Label htmlFor="same-day-hours">Antecedência</Label>
                  <Select
                    value={String(form.same_day_hours_before)}
                    onValueChange={(v) => update('same_day_hours_before', Number(v))}
                  >
                    <SelectTrigger id="same-day-hours">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOURS_BEFORE_OPTIONS.map((h) => (
                        <SelectItem key={h} value={String(h)}>
                          {h} {h === 1 ? 'hora antes' : 'horas antes'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {urlInput('same_day')}
              </div>
            </MessageBlock>

            <p className="text-xs text-muted-foreground">
              Cada consulta recebe cada mensagem uma única vez. Quem agenda depois do horário do lembrete recebe só a
              confirmação; se a consulta for remarcada, os lembretes valem para a nova data. Consultas canceladas não
              recebem lembrete.
            </p>
          </CardContent>
        </Card>

        <SuriSetupGuide />

        <WhatsAppHistoryCard history={history} isLoading={historyLoading} onRefresh={onRefreshHistory} />
      </div>
    </AppLayout>
  );
}

interface MessageBlockProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  action: React.ReactNode;
  children: React.ReactNode;
}

function MessageBlock({ icon, title, description, enabled, onEnabledChange, action, children }: MessageBlockProps) {
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} aria-label={`Ativar ${title.toLowerCase()}`} />
      </div>
      {enabled && (
        <div className="space-y-3">
          {children}
          <div className="flex justify-end">{action}</div>
        </div>
      )}
    </section>
  );
}

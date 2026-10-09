import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import { useProcedures } from '@/hooks/useScheduling';
import { timeToMinutes, WEEKDAY_SHORT_LABELS } from '@/lib/clinicSettings';
import { DEFAULT_SEGMENT_ID, getHealthSegment, HEALTH_SEGMENTS, type HealthSegmentId } from '@/lib/healthSegments';
import { cn } from '@/lib/utils';

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function ClinicSettings() {
  const navigate = useNavigate();
  const { settings, isConfigured, businessHours, saveSettings } = useClinicSettings();
  const { procedures, addProcedureTemplates } = useProcedures();

  const [name, setName] = useState(settings?.name ?? '');
  const [segmentId, setSegmentId] = useState<HealthSegmentId>(settings?.segment ?? DEFAULT_SEGMENT_ID);
  const [addTemplates, setAddTemplates] = useState(procedures.length === 0);
  const [workDays, setWorkDays] = useState<number[]>(businessHours.days);
  const [openTime, setOpenTime] = useState(businessHours.start);
  const [closeTime, setCloseTime] = useState(businessHours.end);
  const [hasBreak, setHasBreak] = useState(businessHours.breakStart !== null);
  const [breakStart, setBreakStart] = useState(businessHours.breakStart ?? '12:00');
  const [breakEnd, setBreakEnd] = useState(businessHours.breakEnd ?? '13:00');
  const [saving, setSaving] = useState(false);

  const segment = getHealthSegment(segmentId);
  const pluralLower = segment.service.plural.toLowerCase();
  const existingNames = new Set(procedures.map((p) => p.name.trim().toLowerCase()));
  const newTemplates = segment.templates.filter((t) => !existingNames.has(t.name.toLowerCase()));

  const toggleWorkDay = (day: number) => {
    setWorkDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  };

  const handleSave = async () => {
    if (timeToMinutes(closeTime) <= timeToMinutes(openTime)) {
      toast.error('O horário de fechamento deve ser depois da abertura.');
      return;
    }
    if (
      hasBreak &&
      (timeToMinutes(breakEnd) <= timeToMinutes(breakStart) ||
        timeToMinutes(breakStart) < timeToMinutes(openTime) ||
        timeToMinutes(breakEnd) > timeToMinutes(closeTime))
    ) {
      toast.error('O intervalo deve ficar dentro do horário de atendimento.');
      return;
    }

    setSaving(true);
    try {
      await saveSettings({
        name: name.trim(),
        segment: segmentId,
        businessHours: {
          days: workDays,
          start: openTime,
          end: closeTime,
          breakStart: hasBreak ? breakStart : null,
          breakEnd: hasBreak ? breakEnd : null,
        },
      });
    } catch {
      toast.error('Não foi possível salvar as configurações. Tente novamente.');
      return;
    } finally {
      setSaving(false);
    }
    const added = addTemplates ? addProcedureTemplates(segment.templates) : 0;
    toast.success(
      added > 0
        ? `Configurações salvas. ${added} ${pluralLower} sugeridos adicionados — revise os preços.`
        : 'Configurações salvas',
    );
    if (!isConfigured) navigate('/agenda');
  };

  return (
    <AppLayout
      title="Configurações"
      description="Adapte o sistema ao seu tipo de atendimento"
      actions={
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar configurações'}
        </Button>
      }
    >
      <div className="space-y-6">
        {!isConfigured && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
            <p className="font-medium">Bem-vindo! Vamos configurar seu estabelecimento.</p>
            <p className="text-muted-foreground">
              Escolha o tipo de atendimento para ajustar especialidades, conselhos profissionais, nomes das telas e{' '}
              {pluralLower} sugeridos. Você pode mudar isso depois.
            </p>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Estabelecimento</CardTitle>
            <CardDescription>O nome aparece no menu e assina as mensagens de WhatsApp.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-md space-y-2">
              <Label htmlFor="establishment-name">Nome</Label>
              <Input
                id="establishment-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Clínica Vida, Laboratório Central"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tipo de atendimento</CardTitle>
            <CardDescription>Escolha o que melhor descreve o seu negócio de saúde.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {HEALTH_SEGMENTS.map((item) => {
                const Icon = item.icon;
                const selected = item.id === segmentId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSegmentId(item.id)}
                    className={cn(
                      'relative flex items-start gap-3 rounded-lg border p-4 text-left transition',
                      selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/50 hover:bg-muted/50',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                        selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">{item.label}</p>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    {selected && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Horário de atendimento</CardTitle>
            <CardDescription>
              Define os horários livres oferecidos no agendamento online do Smart Hub.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Dias de atendimento</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_ORDER.map((day) => {
                  const active = workDays.includes(day);
                  return (
                    <Button
                      key={day}
                      type="button"
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      aria-pressed={active}
                      onClick={() => toggleWorkDay(day)}
                    >
                      {WEEKDAY_SHORT_LABELS[day]}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="grid max-w-md grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="open-time">Abertura</Label>
                <Input id="open-time" type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="close-time">Fechamento</Label>
                <Input id="close-time" type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={hasBreak} onCheckedChange={(checked) => setHasBreak(checked === true)} />
              Intervalo sem atendimento (almoço)
            </label>
            {hasBreak && (
              <div className="grid max-w-md grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="break-start">Início do intervalo</Label>
                  <Input id="break-start" type="time" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="break-end">Fim do intervalo</Label>
                  <Input id="break-end" type="time" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Como fica para {segment.label.toLowerCase()}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">Aba de serviços</p>
                <p className="font-medium">{segment.service.plural}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Conselho padrão dos profissionais</p>
                <p className="font-medium">{segment.defaultCouncil ?? 'Escolhido em cada cadastro'}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-muted-foreground">Especialidades sugeridas</p>
              <div className="flex flex-wrap gap-1.5">
                {segment.specialties.slice(0, 12).map((spec) => (
                  <Badge key={spec} variant="secondary">
                    {spec}
                  </Badge>
                ))}
                {segment.specialties.length > 12 && (
                  <Badge variant="outline">+{segment.specialties.length - 12}</Badge>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-muted-foreground">{segment.service.plural} sugeridos</p>
              <ul className="divide-y rounded-lg border">
                {segment.templates.map((t) => (
                  <li key={t.name} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-medium">
                      {t.name}
                      {existingNames.has(t.name.toLowerCase()) && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">(já cadastrado)</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.category} · {t.duration_minutes} min
                      {t.preparation ? ` · Preparo: ${t.preparation}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              {newTemplates.length > 0 ? (
                <label className="flex items-center gap-2 pt-1">
                  <Checkbox checked={addTemplates} onCheckedChange={(checked) => setAddTemplates(checked === true)} />
                  Adicionar {newTemplates.length} {pluralLower} sugeridos ao salvar (preço inicial R$ 0,00)
                </label>
              ) : (
                <p className="pt-1 text-muted-foreground">Todos os sugeridos já estão cadastrados.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave}>Salvar configurações</Button>
        </div>
      </div>
    </AppLayout>
  );
}

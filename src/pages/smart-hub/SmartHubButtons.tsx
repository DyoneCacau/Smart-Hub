import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Check, Info, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  SmartHubLayout,
  SmartHubImageUpload,
  ColorField,
  FieldHelpLabel,
  FieldHint,
  ButtonEditorPreview,
  ContrastPairAlert,
  ButtonIconPicker,
} from '@/components/smart-hub';
import { BUTTON_FIELD_HELP } from '@/components/smart-hub/buttonEditorCopy';
import { isPublicBookingEnabled } from '@/components/smart-hub/buttonIntentOptions';
import { useSmartHub } from '@/hooks/useSmartHub';
import { useHubButtons } from '@/hooks/useHubButtons';
import { useClinic } from '@/hooks/useClinic';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AssetService, fetchBookingReadiness } from '@/services/smartHub';
import {
  SMART_HUB_VARIANT_LABELS,
  type SmartHubButton,
  type SmartHubButtonVisualVariant,
} from '@/types/smartHub';
import { cn } from '@/lib/utils';

const VARIANT_KEYS = Object.keys(SMART_HUB_VARIANT_LABELS) as SmartHubButtonVisualVariant[];

const BOOKING_BUTTON_TYPE = 'appointment' as const;
const BOOKING_CLICK_ACTION = 'booking' as const;
const DEFAULT_BOOKING_TITLE = 'Agendar online';

/** Onde o dono resolve cada requisito do checklist de agendamento. */
const READINESS_LINKS: Record<string, { to: string; label: string }> = {
  procedure_active: { to: '/procedimentos', label: 'Cadastrar' },
  professional_active: { to: '/profissionais', label: 'Cadastrar' },
  work_schedule: { to: '/configuracoes', label: 'Definir horários' },
};

function storagePathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const clean = url.split('?')[0];
    const marker = '/smart-hub-assets/';
    const idx = clean.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(clean.slice(idx + marker.length));
  } catch {
    return null;
  }
}

function isBookingButton(btn: SmartHubButton): boolean {
  return btn.click_action === BOOKING_CLICK_ACTION;
}

const emptyForm = {
  title: DEFAULT_BOOKING_TITLE,
  subtitle: '',
  visual_variant: 'simple' as SmartHubButtonVisualVariant,
  icon: 'calendar',
  image: '',
  image_alt: '',
  visible: true,
  order_index: 0,
  track_click: true,
  background_color: '',
  text_color: '',
};

type FormState = typeof emptyForm;

export default function SmartHubButtons() {
  const { clinicId } = useClinic();
  const { user } = useAuth();
  const { hub, isLoading, updateHub } = useSmartHub();
  const { buttons, isLoading: loadingButtons, createButton, updateButton, deleteButton } =
    useHubButtons(hub?.id);
  const bookingEnabled = isPublicBookingEnabled(hub);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SmartHubButton | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [uploadingImage, setUploadingImage] = useState(false);

  const readinessQuery = useQuery({
    queryKey: ['smart-hub-booking-readiness', clinicId],
    enabled: Boolean(clinicId && hub),
    queryFn: () =>
      fetchBookingReadiness({
        clinicId: clinicId as string,
        hasSmartHubModule: true,
        hasAgendaModule: true,
      }),
  });
  const readiness = readinessQuery.data;
  const readinessItems = (readiness?.items || []).filter((i) => !i.id.startsWith('module_'));

  const handleBookingToggle = async (next: boolean) => {
    if (next) {
      const result = await readinessQuery.refetch();
      if (!result.data?.ok) {
        toast.error('Complete os itens pendentes para ativar o agendamento online.');
        return;
      }
    }
    await updateHub.mutateAsync({ public_booking_enabled: next }).catch(() => undefined);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, order_index: buttons.length });
    setOpen(true);
  };

  const openEdit = (btn: SmartHubButton) => {
    setEditing(btn);
    setForm({
      title: btn.title,
      subtitle: btn.subtitle || '',
      visual_variant: (btn.visual_variant as SmartHubButtonVisualVariant) || 'simple',
      icon: btn.icon || '',
      image: btn.image || '',
      image_alt: btn.image_alt || '',
      visible: btn.visible,
      order_index: btn.order_index,
      track_click: btn.track_click,
      background_color: btn.background_color || '',
      text_color: btn.text_color || '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error('Informe o título do botão.');
      return;
    }

    const payload = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      type: BOOKING_BUTTON_TYPE,
      click_action: BOOKING_CLICK_ACTION,
      url: null,
      whatsapp_message: null,
      capture_config: {},
      visual_variant: form.visual_variant,
      icon: form.icon || null,
      image: form.image || null,
      image_alt: form.image_alt || null,
      visible: form.visible,
      order_index: Number(form.order_index) || 0,
      track_click: form.track_click,
      background_color: form.background_color || null,
      text_color: form.text_color || null,
      status: 'active' as const,
    };

    if (editing) {
      await updateButton.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createButton.mutateAsync(payload);
    }
    setOpen(false);
  };

  const handleButtonImageUpload = async (file: File) => {
    if (!clinicId || !hub?.id || !editing?.id) {
      toast.error('Salve o botão antes de enviar a imagem.');
      return;
    }
    setUploadingImage(true);
    try {
      const asset = await AssetService.upload(clinicId, hub.id, file, {
        userId: user?.id,
        kind: 'button',
        buttonId: editing.id,
        previousStoragePath: storagePathFromPublicUrl(form.image),
      });
      const url = asset.public_url || '';
      setForm((f) => ({ ...f, image: url }));
      await updateButton.mutateAsync({ id: editing.id, image: url || null });
      setEditing((prev) => (prev ? { ...prev, image: url || null } : prev));
      toast.success('Imagem enviada com sucesso.');
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Não foi possível enviar a imagem.';
      toast.error(message);
      throw err;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleButtonImageRemove = async () => {
    setForm((f) => ({ ...f, image: '' }));
    if (editing?.id) {
      await updateButton.mutateAsync({ id: editing.id, image: null });
      setEditing((prev) => (prev ? { ...prev, image: null } : prev));
    }
  };

  const fixContrast = (nextTextColor: string) => {
    setForm((f) => ({ ...f, text_color: nextTextColor }));
    toast.message('Contraste ajustado', {
      description: 'A cor do texto foi atualizada para melhorar a leitura. Salve para aplicar.',
    });
  };

  const previewModel = {
    title: form.title,
    subtitle: form.subtitle,
    type: BOOKING_BUTTON_TYPE,
    click_action: BOOKING_CLICK_ACTION,
    visual_variant: form.visual_variant,
    url: '',
    whatsapp_message: '',
    icon: form.icon,
    image: form.image,
    image_alt: form.image_alt,
    background_color: form.background_color || '#0F766E',
    text_color: form.text_color || '#FFFFFF',
  };

  const bookingCard = (
    <div className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarCheck className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">Agendamento online</h2>
              <Badge variant={bookingEnabled ? 'default' : 'secondary'}>
                {bookingEnabled ? 'Ativo' : 'Desativado'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Ao clicar no botão, o visitante escolhe o procedimento, o profissional, a data e um
              horário livre na sua agenda. O agendamento entra direto na Agenda como confirmado.
            </p>
          </div>
        </div>
        <Switch
          checked={bookingEnabled}
          disabled={updateHub.isPending || readinessQuery.isFetching}
          onCheckedChange={(v) => void handleBookingToggle(v)}
          aria-label="Ativar agendamento online"
        />
      </div>

      {readinessItems.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {readinessItems.map((item) => {
            const link = READINESS_LINKS[item.id];
            return (
              <li
                key={item.id}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm',
                  item.ok ? 'text-muted-foreground' : 'border-amber-300 bg-amber-50 text-amber-900'
                )}
              >
                <span className="flex items-center gap-2">
                  {item.ok ? (
                    <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <X className="h-4 w-4 shrink-0" />
                  )}
                  {item.label}
                </span>
                {!item.ok && link ? (
                  <Button variant="link" size="sm" className="h-auto p-0" asChild>
                    <Link to={link.to}>{link.label}</Link>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {bookingEnabled && hub?.status !== 'published' ? (
        <p className="text-xs text-muted-foreground">
          Publique o Smart Hub no Dashboard para que os visitantes consigam agendar.
        </p>
      ) : null}
    </div>
  );

  const formFields = (
    <div className="space-y-5">
      {!bookingEnabled ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Agendamento online desativado</AlertTitle>
          <AlertDescription>
            Você pode salvar o botão agora, mas os visitantes só conseguirão agendar depois que o
            agendamento online for ativado na tela de Botões.
          </AlertDescription>
        </Alert>
      ) : null}
      {editing && !isBookingButton(editing) ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Este botão será convertido</AlertTitle>
          <AlertDescription>
            No momento os botões abrem apenas o agendamento online. Ao salvar, este botão passa a
            abrir o agendamento.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <FieldHelpLabel htmlFor="btn-title" label="Título" help={BUTTON_FIELD_HELP.title} />
        <Input
          id="btn-title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Ex.: Agendar consulta"
        />
      </div>

      <div className="space-y-2">
        <FieldHelpLabel htmlFor="btn-subtitle" label="Subtítulo" help={BUTTON_FIELD_HELP.subtitle} />
        <Input
          id="btn-subtitle"
          value={form.subtitle}
          onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
          placeholder="Ex.: Escolha o profissional e o melhor horário"
        />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Aparência</p>
        <div className="space-y-2">
          <FieldHelpLabel label="Variante visual" help={BUTTON_FIELD_HELP.visual_variant} />
          <Select
            value={form.visual_variant}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, visual_variant: v as SmartHubButtonVisualVariant }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-72">
              {VARIANT_KEYS.map((v) => (
                <SelectItem key={v} value={v}>
                  {SMART_HUB_VARIANT_LABELS[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            id="btn_bg"
            label="Cor de fundo"
            help={BUTTON_FIELD_HELP.background_color}
            value={form.background_color || '#0F766E'}
            fallback="#0F766E"
            onChange={(v) => setForm((f) => ({ ...f, background_color: v }))}
          />
          <ColorField
            id="btn_text"
            label="Cor do texto"
            help={BUTTON_FIELD_HELP.text_color}
            value={form.text_color || '#FFFFFF'}
            fallback="#FFFFFF"
            onChange={(v) => setForm((f) => ({ ...f, text_color: v }))}
          />
        </div>
        <ContrastPairAlert
          backgroundColor={form.background_color || '#0F766E'}
          textColor={form.text_color || '#FFFFFF'}
          onFix={fixContrast}
        />
        <div className="space-y-2">
          <FieldHelpLabel label="Ícone" help={BUTTON_FIELD_HELP.icon} />
          <ButtonIconPicker
            value={form.icon}
            onChange={(next) => setForm((f) => ({ ...f, icon: next }))}
          />
        </div>
        <div className="space-y-2">
          <FieldHelpLabel label="Imagem do botão (opcional)" help={BUTTON_FIELD_HELP.image} />
          {editing?.id && clinicId && hub ? (
            <>
              <SmartHubImageUpload
                kind="button"
                currentUrl={form.image || null}
                clinicId={clinicId}
                hubId={hub.id}
                disabled={uploadingImage || updateButton.isPending}
                onUpload={handleButtonImageUpload}
                onRemove={handleButtonImageRemove}
              />
              <div className="space-y-2">
                <FieldHelpLabel
                  htmlFor="img-alt"
                  label="Texto alternativo da imagem"
                  help={BUTTON_FIELD_HELP.image_alt}
                />
                <Input
                  id="img-alt"
                  value={form.image_alt}
                  onChange={(e) => setForm((f) => ({ ...f, image_alt: e.target.value }))}
                />
              </div>
            </>
          ) : (
            <FieldHint>Salve o botão primeiro para enviar uma imagem.</FieldHint>
          )}
        </div>
      </div>

      <div className="lg:hidden">
        <ButtonEditorPreview model={previewModel} showActualColors />
      </div>

      <div className="grid gap-4 rounded-lg border px-3 py-3 sm:grid-cols-2">
        <div className="space-y-2">
          <FieldHelpLabel htmlFor="btn-order" label="Ordem" help={BUTTON_FIELD_HELP.order_index} />
          <Input
            id="btn-order"
            type="number"
            value={form.order_index}
            onChange={(e) => setForm((f) => ({ ...f, order_index: Number(e.target.value) || 0 }))}
          />
        </div>
        <div className="flex items-center justify-between gap-2 sm:pt-6">
          <FieldHelpLabel label="Visível" help={BUTTON_FIELD_HELP.visible} />
          <Switch
            checked={form.visible}
            onCheckedChange={(v) => setForm((f) => ({ ...f, visible: v }))}
          />
        </div>
        <div className="flex items-center justify-between gap-2 sm:col-span-2">
          <FieldHelpLabel label="Rastrear cliques" help={BUTTON_FIELD_HELP.track_click} />
          <Switch
            checked={form.track_click}
            onCheckedChange={(v) => setForm((f) => ({ ...f, track_click: v }))}
          />
        </div>
      </div>
    </div>
  );

  return (
    <SmartHubLayout
      title="Botões"
      description="Botões de agendamento online da sua página pública."
      actions={
        hub ? (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Novo botão
          </Button>
        ) : undefined
      }
    >
      {isLoading || loadingButtons ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : !hub ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Crie um Smart Hub no Dashboard para gerenciar botões.
        </div>
      ) : (
        <div className="space-y-6">
          {bookingCard}

          <div className="space-y-3">
            {buttons.map((btn) => (
              <div
                key={btn.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {btn.image ? (
                    <img
                      src={btn.image}
                      alt={btn.image_alt || btn.title}
                      className="h-12 w-12 shrink-0 rounded-md border object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                      <CalendarCheck className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium">{btn.title}</p>
                    {btn.subtitle ? (
                      <p className="truncate text-sm text-muted-foreground">{btn.subtitle}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isBookingButton(btn) ? (
                    <Badge variant="outline">Agendamento online</Badge>
                  ) : (
                    <Badge variant="secondary" title="Edite e salve para converter em agendamento online">
                      Outro tipo — edite para converter
                    </Badge>
                  )}
                  <Badge variant={btn.visible ? 'default' : 'secondary'}>
                    {btn.visible ? 'Visível' : 'Oculto'}
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(btn)} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover"
                    onClick={() => {
                      if (confirm('Remover este botão?')) deleteButton.mutate(btn.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {!buttons.length && (
              <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
                <p className="font-medium text-foreground">Nenhum botão ainda</p>
                <p className="mt-1 text-sm">
                  Crie um botão de agendamento para os visitantes marcarem horário pela sua página.
                </p>
                <Button className="mt-4" onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Criar botão de agendamento
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(
            'flex max-h-[min(92vh,100dvh)] flex-col gap-0 overflow-hidden p-0',
            'w-[calc(100vw-1.5rem)] max-w-lg sm:max-w-3xl lg:max-w-4xl'
          )}
        >
          <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-3 text-left sm:px-5 sm:py-4">
            <DialogTitle>{editing ? 'Editar botão de agendamento' : 'Novo botão de agendamento'}</DialogTitle>
            <DialogDescription>
              O botão abre o agendamento online com procedimentos, profissionais e horários livres.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
              <div className="min-w-0">{formFields}</div>
              <div className="hidden min-w-0 lg:sticky lg:top-0 lg:block lg:self-start">
                <ButtonEditorPreview model={previewModel} showActualColors />
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t bg-background px-4 py-3 sm:px-5 sm:py-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!form.title.trim() || createButton.isPending || updateButton.isPending}
              onClick={() => void save()}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SmartHubLayout>
  );
}

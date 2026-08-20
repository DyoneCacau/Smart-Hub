import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, Monitor, Smartphone, Tablet } from 'lucide-react';
import { toast } from 'sonner';
import {
  SmartHubLayout,
  PublishWorkflowCard,
  SmartHubImageUpload,
  SmartHubDevicePreview,
  ColorField,
  HubPublicView,
} from '@/components/smart-hub';
import { useSmartHub } from '@/hooks/useSmartHub';
import { useHubButtons } from '@/hooks/useHubButtons';
import { useClinic } from '@/hooks/useClinic';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  AssetService,
  HubService,
  STYLE_PRESETS,
  mergeVisualConfig,
  generateSlugFromTitle,
  defaultCaptureConfig,
  mergeCaptureConfig,
  CaptureService,
  assertValidOwnerInput,
  normalizeOwnerUserId,
  fetchBookingReadiness,
  formatBookingReadinessChecklist,
  type BookingReadinessItem,
} from '@/services/smartHub';
import {
  SMART_HUB_STYLE_PRESET_LABELS,
  type PublicSmartHubPayload,
  type SmartHubAssetKind,
  type SmartHubCaptureConfig,
  type SmartHubStylePreset,
  type SmartHubVisualConfig,
} from '@/types/smartHub';
import type { SmartHubPreviewDevice } from '@/components/smart-hub/SmartHubDevicePreview';
import { useSubscription } from '@/hooks/useSubscription';
import { useClinicStaffOptions } from '@/hooks/useClinicStaffOptions';
import { CRM_STAGES } from '@/types/crm';
const STYLE_PRESET_KEYS = Object.keys(SMART_HUB_STYLE_PRESET_LABELS) as SmartHubStylePreset[];

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

export default function SmartHubSettings() {
  const queryClient = useQueryClient();
  const { clinicId } = useClinic();
  const { user } = useAuth();
  const { hasFeature } = useSubscription();
  const { can, isLoading: permissionsLoading } = usePermissions();
  const { staff } = useClinicStaffOptions();
  const hasCrm = hasFeature('crm');
  const hasAgenda = hasFeature('agenda');
  const hasSmartHubModule = hasFeature('smart_hub');
  const canEditHub = permissionsLoading ? false : can('smart_hub', 'can_edit');
  const {
    hub,
    theme,
    isLoading,
    updateHub,
    checkSlug,
    publicUrl,
    lastValidation,
    validateHub,
    publishHub,
    pauseHub,
    revertToDraft,
    refetch,
  } = useSmartHub();
  const { buttons } = useHubButtons(hub?.id);

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [slug, setSlug] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [profileUrl, setProfileUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#0F766E');
  const [secondaryColor, setSecondaryColor] = useState('#134E4A');
  const [stylePreset, setStylePreset] = useState<SmartHubStylePreset>('clean');
  const [visualConfig, setVisualConfig] = useState<SmartHubVisualConfig>({});
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactAddress, setContactAddress] = useState('');
  const [mapEmbedUrl, setMapEmbedUrl] = useState('');
  const [captureConfig, setCaptureConfig] = useState<SmartHubCaptureConfig>(
    defaultCaptureConfig()
  );
  const [publicBookingEnabled, setPublicBookingEnabled] = useState(false);
  const [bookingChecklist, setBookingChecklist] = useState<BookingReadinessItem[] | null>(
    null
  );
  const [bookingCheckBusy, setBookingCheckBusy] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<SmartHubPreviewDevice>('mobile');
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);

  useEffect(() => {
    if (!hub) return;
    setTitle(hub.title);
    setSubtitle(hub.subtitle || '');
    setDescription(hub.description || '');
    setSlug(hub.slug);
    setSeoTitle(hub.seo_title || '');
    setSeoDescription(hub.seo_description || '');
    setLogoUrl(hub.logo_url || '');
    setBannerUrl(hub.banner_url || '');
    setProfileUrl(hub.profile_url || '');
    setPrimaryColor(hub.primary_color || '#0F766E');
    setSecondaryColor(hub.secondary_color || '#134E4A');
    const preset = (hub.style_preset as SmartHubStylePreset) || 'clean';
    setStylePreset(STYLE_PRESETS[preset] ? preset : 'clean');
    setVisualConfig(mergeVisualConfig(hub.style_preset, hub.visual_config));
    setWhatsappNumber(hub.whatsapp_number || '');
    setContactPhone(hub.contact_phone || '');
    setContactEmail(hub.contact_email || '');
    setContactAddress(hub.contact_address || '');
    setMapEmbedUrl(hub.map_embed_url || '');
    setCaptureConfig(mergeCaptureConfig(hub.capture_config));
    setPublicBookingEnabled(hub.public_booking_enabled === true);
  }, [hub]);

  const previewPayload = useMemo((): PublicSmartHubPayload | null => {
    if (!hub) return null;
    const visibleButtons = buttons.filter(
      (b) => b.visible && b.status === 'active' && !b.deleted_at
    );
    return {
      hub: {
        ...hub,
        title,
        subtitle: subtitle || null,
        description: description || null,
        slug,
        logo_url: logoUrl || null,
        banner_url: bannerUrl || null,
        profile_url: profileUrl || null,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        style_preset: stylePreset,
        visual_config: visualConfig,
        whatsapp_number: whatsappNumber || null,
        contact_phone: contactPhone || null,
        contact_email: contactEmail || null,
        contact_address: contactAddress || null,
        map_embed_url: mapEmbedUrl || null,
        seo_title: seoTitle || null,
        seo_description: seoDescription || null,
        capture_config: captureConfig,
        public_booking_enabled: publicBookingEnabled,
      },
      theme: theme
        ? {
            ...theme,
            primary_color: primaryColor,
            secondary_color: secondaryColor,
            background_color: visualConfig.background_color ?? theme.background_color,
            text_color: visualConfig.text_color ?? theme.text_color,
          }
        : null,
      buttons: visibleButtons,
      page: null,
      assets: [],
      preview: true,
    };
  }, [
    hub,
    theme,
    buttons,
    title,
    subtitle,
    description,
    slug,
    logoUrl,
    bannerUrl,
    profileUrl,
    primaryColor,
    secondaryColor,
    stylePreset,
    visualConfig,
    whatsappNumber,
    contactPhone,
    contactEmail,
    contactAddress,
    mapEmbedUrl,
    seoTitle,
    seoDescription,
    captureConfig,
    publicBookingEnabled,
  ]);

  const patchVisual = (patch: Partial<SmartHubVisualConfig>) => {
    setVisualConfig((prev) => ({ ...prev, ...patch }));
  };

  const applyStylePreset = (preset: SmartHubStylePreset) => {
    const cfg = STYLE_PRESETS[preset];
    if (!cfg) return;
    setStylePreset(preset);
    setPrimaryColor(cfg.primary_color);
    setSecondaryColor(cfg.secondary_color);
    setVisualConfig({ ...cfg.visual_config });
  };

  const restoreTemplateColors = () => {
    if (
      !confirm(
        'Restaurar as cores do template atual? As cores personalizadas da prévia serão substituídas.'
      )
    ) {
      return;
    }
    applyStylePreset(stylePreset);
    toast.success('Cores do template restauradas na prévia.');
  };

  const refreshHubQueries = async () => {
    if (clinicId) {
      await queryClient.invalidateQueries({ queryKey: ['smart-hub', clinicId] });
      await queryClient.invalidateQueries({ queryKey: ['smart-hub-preview', hub?.id] });
      await queryClient.invalidateQueries({ queryKey: ['public-smart-hub'] });
    }
    await refetch();
  };

  const persistImageField = async (
    kind: Extract<SmartHubAssetKind, 'logo' | 'banner' | 'profile'>,
    url: string | null
  ) => {
    if (!clinicId || !hub?.id) throw new Error('Hub não encontrado.');
    const patch =
      kind === 'logo'
        ? { logo_url: url }
        : kind === 'banner'
          ? { banner_url: url }
          : { profile_url: url };

    await HubService.update(hub.id, clinicId, patch, user?.id);
    if (kind === 'logo') setLogoUrl(url || '');
    if (kind === 'banner') setBannerUrl(url || '');
    if (kind === 'profile') setProfileUrl(url || '');
    await refreshHubQueries();
  };

  const handleImageUpload = async (
    kind: Extract<SmartHubAssetKind, 'logo' | 'banner' | 'profile'>,
    file: File
  ) => {
    if (!clinicId || !hub?.id) throw new Error('Hub não encontrado.');
    const currentUrl =
      kind === 'logo' ? logoUrl : kind === 'banner' ? bannerUrl : profileUrl;

    setImageBusy(true);
    try {
      const asset = await AssetService.upload(clinicId, hub.id, file, {
        userId: user?.id,
        kind,
        previousStoragePath: storagePathFromPublicUrl(currentUrl),
      });

      const url = asset.public_url || '';
      await persistImageField(kind, url || null);
      toast.success(
        kind === 'logo'
          ? 'Logo atualizada.'
          : kind === 'banner'
            ? 'Banner atualizado.'
            : 'Foto de perfil atualizada.'
      );
    } finally {
      setImageBusy(false);
    }
  };

  const handleImageRemove = async (
    kind: Extract<SmartHubAssetKind, 'logo' | 'banner' | 'profile'>
  ) => {
    setImageBusy(true);
    try {
      await persistImageField(kind, null);
      toast.success(
        kind === 'logo'
          ? 'Logo removida.'
          : kind === 'banner'
            ? 'Banner removido.'
            : 'Foto de perfil removida.'
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Não foi possível remover a imagem.'
      );
    } finally {
      setImageBusy(false);
    }
  };

  const saveSettings = async () => {
    if (!canEditHub) {
      toast.error('Você não tem permissão para editar o Smart Hub.');
      return;
    }
    const ownerCheck = assertValidOwnerInput(captureConfig.default_owner_user_id);
    if (ownerCheck.ok === false) {
      toast.error(ownerCheck.message);
      return;
    }

    const enablingBooking =
      publicBookingEnabled === true && hub?.public_booking_enabled !== true;

    if (enablingBooking) {
      if (!clinicId) {
        toast.error('Clínica não encontrada.');
        return;
      }
      setBookingCheckBusy(true);
      try {
        const readiness = await fetchBookingReadiness({
          clinicId,
          hasSmartHubModule,
          hasAgendaModule: hasAgenda,
        });
        setBookingChecklist(readiness.items);
        if (!readiness.ok) {
          setPublicBookingEnabled(false);
          toast.error('Não é possível ativar o agendamento online.', {
            description: formatBookingReadinessChecklist(readiness.items),
          });
          return;
        }
      } catch (err) {
        setPublicBookingEnabled(hub?.public_booking_enabled === true);
        toast.error(
          err instanceof Error
            ? err.message
            : 'Não foi possível validar os requisitos do agendamento online.'
        );
        return;
      } finally {
        setBookingCheckBusy(false);
      }
    }

    const sanitizedCapture: SmartHubCaptureConfig = {
      ...captureConfig,
      default_owner_user_id: normalizeOwnerUserId(ownerCheck.owner),
      initial_stage: captureConfig.initial_stage || 'new',
    };

    try {
      // Nome público e slug são enviados em campos separados — nunca sobrescrever um pelo outro.
      await updateHub.mutateAsync({
        title: title.trim(),
        subtitle: subtitle || null,
        description: description || null,
        slug: slug.trim(),
        seo_title: seoTitle || null,
        seo_description: seoDescription || null,
        logo_url: logoUrl || null,
        banner_url: bannerUrl || null,
        profile_url: profileUrl || null,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        style_preset: stylePreset,
        visual_config: visualConfig,
        whatsapp_number: whatsappNumber || null,
        contact_phone: contactPhone || null,
        contact_email: contactEmail || null,
        contact_address: contactAddress || null,
        map_embed_url: mapEmbedUrl || null,
        capture_config: sanitizedCapture,
        public_booking_enabled: publicBookingEnabled,
      });
      setBookingChecklist(null);
      await refreshHubQueries();
    } catch {
      // Toast único vem de updateHub.onError; restaura o switch ao valor persistido.
      setPublicBookingEnabled(hub?.public_booking_enabled === true);
    }
  };

  const handlePublicBookingToggle = async (next: boolean) => {
    if (!canEditHub) {
      toast.error('Você não tem permissão para editar o Smart Hub.');
      return;
    }
    if (!next) {
      setPublicBookingEnabled(false);
      setBookingChecklist(null);
      return;
    }
    if (!clinicId) {
      toast.error('Clínica não encontrada.');
      return;
    }
    setBookingCheckBusy(true);
    try {
      const readiness = await fetchBookingReadiness({
        clinicId,
        hasSmartHubModule,
        hasAgendaModule: hasAgenda,
      });
      setBookingChecklist(readiness.items);
      if (!readiness.ok) {
        setPublicBookingEnabled(false);
        toast.error('Não é possível ativar o agendamento online.', {
          description: formatBookingReadinessChecklist(readiness.items),
        });
        return;
      }
      setPublicBookingEnabled(true);
    } catch (err) {
      setPublicBookingEnabled(hub?.public_booking_enabled === true);
      toast.error(
        err instanceof Error
          ? err.message
          : 'Não foi possível validar os requisitos do agendamento online.'
      );
    } finally {
      setBookingCheckBusy(false);
    }
  };

  const previewBody = previewPayload ? (
    <SmartHubDevicePreview device={previewDevice}>
      <HubPublicView payload={previewPayload} preview className="min-h-0" />
    </SmartHubDevicePreview>
  ) : null;

  const previewControls = (
    <div className="mb-3 space-y-2">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        As alterações da prévia só serão publicadas após salvar.
      </div>
      <ToggleGroup
        type="single"
        value={previewDevice}
        onValueChange={(v) => {
          if (v) setPreviewDevice(v as SmartHubPreviewDevice);
        }}
        variant="outline"
        size="sm"
        className="justify-start"
      >
        <ToggleGroupItem value="mobile" aria-label="Prévia celular">
          <Smartphone className="mr-1.5 h-3.5 w-3.5" />
          Celular
        </ToggleGroupItem>
        <ToggleGroupItem value="tablet" aria-label="Prévia tablet">
          <Tablet className="mr-1.5 h-3.5 w-3.5" />
          Tablet
        </ToggleGroupItem>
        <ToggleGroupItem value="desktop" aria-label="Prévia desktop">
          <Monitor className="mr-1.5 h-3.5 w-3.5" />
          Desktop
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );

  const formSection = hub && clinicId ? (
    <div className="space-y-6">
      <PublishWorkflowCard
        hub={hub}
        validating={validateHub.isPending}
        publishing={publishHub.isPending}
        pausing={pauseHub.isPending}
        lastValidation={lastValidation}
        onValidate={() => validateHub.mutateAsync()}
        onPublish={() => publishHub.mutate()}
        onPause={() => pauseHub.mutate()}
        onRevertDraft={() => revertToDraft.mutate()}
      />

      <div className="space-y-6 rounded-lg border bg-card p-4 sm:p-6">
        <div>
          <h3 className="text-sm font-semibold">Identidade</h3>
          <p className="text-xs text-muted-foreground">
            Nome público, textos e imagens da página.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Nome público da clínica</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Clínica Sorriso"
          />
          <p className="text-xs text-muted-foreground">
            Nome legível exibido no topo da página. Ex.: Clínica Sorriso — não é o endereço da URL.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="subtitle">Subtítulo</Label>
          <Input id="subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Descrição</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">Slug (endereço da página)</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="min-w-[180px] flex-1"
              placeholder="clinica-sorriso"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setSlug(generateSlugFromTitle(title))}
            >
              Gerar do nome
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={checkSlug.isPending}
              onClick={async () => {
                const ok = await checkSlug.mutateAsync(slug);
                if (ok) toast.success('Slug disponível.');
                else toast.error('Slug indisponível ou inválido.');
              }}
            >
              Validar slug
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Apenas o caminho da URL (ex.: clinica-sorriso). Editar o slug não altera o nome público.
          </p>
          {publicUrl && (
            <p className="break-all text-xs text-muted-foreground">{publicUrl}</p>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium">Imagens</h4>
            <p className="text-xs text-muted-foreground">
              JPG, PNG ou WebP. A prévia atualiza assim que o envio concluir.
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="space-y-1.5">
              <Label>Logo</Label>
              <SmartHubImageUpload
                kind="logo"
                currentUrl={logoUrl || null}
                clinicId={clinicId}
                hubId={hub.id}
                disabled={imageBusy || updateHub.isPending}
                onUpload={(file) => handleImageUpload('logo', file)}
                onRemove={() => handleImageRemove('logo')}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Foto de perfil</Label>
              <SmartHubImageUpload
                kind="profile"
                currentUrl={profileUrl || null}
                clinicId={clinicId}
                hubId={hub.id}
                disabled={imageBusy || updateHub.isPending}
                onUpload={(file) => handleImageUpload('profile', file)}
                onRemove={() => handleImageRemove('profile')}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Banner</Label>
            <SmartHubImageUpload
              kind="banner"
              currentUrl={bannerUrl || null}
              clinicId={clinicId}
              hubId={hub.id}
              disabled={imageBusy || updateHub.isPending}
              onUpload={(file) => handleImageUpload('banner', file)}
              onRemove={() => handleImageRemove('banner')}
            />
          </div>
        </div>
      </div>

      <div className="space-y-6 rounded-lg border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Visual</h3>
            <p className="text-xs text-muted-foreground">
              Cores, estilo e aparência da página pública.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={restoreTemplateColors}>
            Restaurar cores do template
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Estilo visual</Label>
          <Select
            value={stylePreset}
            onValueChange={(v) => applyStylePreset(v as SmartHubStylePreset)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STYLE_PRESET_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {SMART_HUB_STYLE_PRESET_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            id="primary_color"
            label="Cor primária"
            value={primaryColor}
            fallback={STYLE_PRESETS[stylePreset]?.primary_color || '#0F766E'}
            onChange={setPrimaryColor}
          />
          <ColorField
            id="secondary_color"
            label="Cor secundária"
            value={secondaryColor}
            fallback={STYLE_PRESETS[stylePreset]?.secondary_color || '#134E4A'}
            onChange={setSecondaryColor}
          />
          <ColorField
            id="bg_color"
            label="Cor de fundo"
            value={visualConfig.background_color || '#F8FAFC'}
            fallback={STYLE_PRESETS[stylePreset]?.visual_config.background_color || '#F8FAFC'}
            onChange={(v) => patchVisual({ background_color: v })}
          />
          <ColorField
            id="text_color"
            label="Cor do texto"
            value={visualConfig.text_color || '#0F172A'}
            fallback={STYLE_PRESETS[stylePreset]?.visual_config.text_color || '#0F172A'}
            contrastAgainst={visualConfig.background_color || '#F8FAFC'}
            onChange={(v) => patchVisual({ text_color: v })}
          />
          <ColorField
            id="button_bg"
            label="Cor do botão"
            value={visualConfig.button_bg_color || primaryColor}
            fallback={STYLE_PRESETS[stylePreset]?.visual_config.button_bg_color || primaryColor}
            onChange={(v) => patchVisual({ button_bg_color: v })}
          />
          <ColorField
            id="button_text"
            label="Texto do botão"
            value={visualConfig.button_text_color || '#FFFFFF'}
            fallback={STYLE_PRESETS[stylePreset]?.visual_config.button_text_color || '#FFFFFF'}
            contrastAgainst={visualConfig.button_bg_color || primaryColor}
            onChange={(v) => patchVisual({ button_text_color: v })}
          />
          <ColorField
            id="card_bg"
            label="Fundo do card"
            value={visualConfig.card_bg_color || '#FFFFFF'}
            fallback={STYLE_PRESETS[stylePreset]?.visual_config.card_bg_color || '#FFFFFF'}
            onChange={(v) => patchVisual({ card_bg_color: v })}
          />
          <ColorField
            id="border_color"
            label="Cor da borda"
            value={visualConfig.border_color || '#E2E8F0'}
            fallback={STYLE_PRESETS[stylePreset]?.visual_config.border_color || '#E2E8F0'}
            onChange={(v) => patchVisual({ border_color: v })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Modo de fundo</Label>
            <Select
              value={visualConfig.background_mode || 'solid'}
              onValueChange={(v) =>
                patchVisual({ background_mode: v as SmartHubVisualConfig['background_mode'] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">Sólido</SelectItem>
                <SelectItem value="gradient">Gradiente</SelectItem>
                <SelectItem value="image">Imagem</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <div>
              <Label htmlFor="floating_wa">WhatsApp flutuante</Label>
              <p className="text-xs text-muted-foreground">Botão fixo no canto da página</p>
            </div>
            <Switch
              id="floating_wa"
              checked={Boolean(visualConfig.floating_whatsapp)}
              onCheckedChange={(v) => patchVisual({ floating_whatsapp: v })}
            />
          </div>
        </div>
      </div>

      <div className="space-y-6 rounded-lg border bg-card p-4 sm:p-6">
        <div>
          <h3 className="text-sm font-semibold">Contatos</h3>
          <p className="text-xs text-muted-foreground">WhatsApp, telefone, e-mail e endereço.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="whatsapp">WhatsApp (DDI+DDD+número)</Label>
            <Input
              id="whatsapp"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="5511999999999"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Endereço</Label>
            <Input
              id="address"
              value={contactAddress}
              onChange={(e) => setContactAddress(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="map">URL embed do mapa</Label>
          <Input
            id="map"
            value={mapEmbedUrl}
            onChange={(e) => setMapEmbedUrl(e.target.value)}
            placeholder="https://www.google.com/maps/embed?..."
          />
        </div>
      </div>

      <div className="space-y-6 rounded-lg border bg-card p-4 sm:p-6">
        <div>
          <h3 className="text-sm font-semibold">Agendamento online</h3>
          <p className="text-xs text-muted-foreground">
            Controle se o visitante pode marcar horários diretamente pela página pública.
          </p>
        </div>
        <div className="flex items-start justify-between gap-3 rounded-lg border px-3 py-3">
          <div className="space-y-1 pr-2">
            <Label htmlFor="public_booking_enabled">
              Permitir agendamento online pelo Smart Hub
            </Label>
            <p className="text-xs text-muted-foreground">
              Permite que o visitante escolha procedimento, profissional, data e horário
              disponíveis e confirme o agendamento diretamente na agenda da clínica.
            </p>
            {!publicBookingEnabled ? (
              <p className="text-xs text-muted-foreground">
                Com esta opção desligada, a opção “Agendamento online” fica indisponível no
                editor de botões.
              </p>
            ) : null}
            {!canEditHub ? (
              <p className="text-xs text-amber-800">
                Sua permissão atual não permite alterar esta configuração.
              </p>
            ) : null}
          </div>
          <Switch
            id="public_booking_enabled"
            checked={publicBookingEnabled}
            disabled={!canEditHub || bookingCheckBusy || updateHub.isPending || imageBusy}
            onCheckedChange={(v) => void handlePublicBookingToggle(v)}
          />
        </div>
        {bookingChecklist ? (
          <ul className="space-y-1 rounded-md border bg-muted/40 px-3 py-2 text-xs">
            {bookingChecklist.map((item) => (
              <li
                key={item.id}
                className={item.ok ? 'text-muted-foreground' : 'text-destructive'}
              >
                {item.ok ? '✓' : '✗'} {item.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="space-y-6 rounded-lg border bg-card p-4 sm:p-6">
        <div>
          <h3 className="text-sm font-semibold">Formulário e CRM</h3>
          <p className="text-xs text-muted-foreground">
            Configure como os contatos recebidos pelos formulários serão organizados no CRM.
          </p>
        </div>

        {!hasCrm ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            O módulo CRM no plano é necessário para receber leads pelos formulários do Smart Hub.
            Botões com ação “Abrir WhatsApp” continuam funcionando normalmente.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Etapa inicial padrão</Label>
              <Select
                value={captureConfig.initial_stage || 'new'}
                onValueChange={(v) =>
                  setCaptureConfig((prev) => ({
                    ...prev,
                    initial_stage: v as SmartHubCaptureConfig['initial_stage'],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRM_STAGES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Etapa do Kanban em que o lead entra após o formulário.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Responsável padrão</Label>
              <Select
                value={captureConfig.default_owner_user_id || '__none__'}
                onValueChange={(v) =>
                  setCaptureConfig((prev) => ({
                    ...prev,
                    default_owner_user_id: v === '__none__' ? null : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem responsável</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Título do formulário</Label>
              <Input
                value={captureConfig.form_title || ''}
                onChange={(e) =>
                  setCaptureConfig((prev) => ({ ...prev, form_title: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Descrição do formulário</Label>
              <Textarea
                value={captureConfig.form_description || ''}
                onChange={(e) =>
                  setCaptureConfig((prev) => ({ ...prev, form_description: e.target.value }))
                }
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Texto do botão Enviar</Label>
              <Input
                value={captureConfig.submit_label || ''}
                onChange={(e) =>
                  setCaptureConfig((prev) => ({ ...prev, submit_label: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>URL opcional após envio</Label>
              <Input
                value={captureConfig.redirect_url || ''}
                onChange={(e) =>
                  setCaptureConfig((prev) => ({ ...prev, redirect_url: e.target.value || null }))
                }
                placeholder="https://..."
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 sm:col-span-2">
              <div>
                <Label>Exigir aceite de privacidade</Label>
              </div>
              <Switch
                checked={captureConfig.require_privacy_accept !== false}
                onCheckedChange={(v) =>
                  setCaptureConfig((prev) => ({ ...prev, require_privacy_accept: v }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Texto do consentimento</Label>
              <Textarea
                value={captureConfig.privacy_text || ''}
                onChange={(e) =>
                  setCaptureConfig((prev) => ({ ...prev, privacy_text: e.target.value }))
                }
                rows={2}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Mensagem de confirmação</Label>
              <Input
                value={captureConfig.success_message || ''}
                onChange={(e) =>
                  setCaptureConfig((prev) => ({ ...prev, success_message: e.target.value }))
                }
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 sm:col-span-2">
              <div>
                <Label>Abrir WhatsApp após envio</Label>
                <p className="text-xs text-muted-foreground">
                  Só abre o WhatsApp depois de confirmar o salvamento no CRM.
                </p>
              </div>
              <Switch
                checked={Boolean(captureConfig.redirect_whatsapp_after_submit)}
                onCheckedChange={(v) =>
                  setCaptureConfig((prev) => ({ ...prev, redirect_whatsapp_after_submit: v }))
                }
              />
            </div>
            {captureConfig.redirect_whatsapp_after_submit ? (
              <>
                <div className="space-y-2">
                  <Label>Telefone do WhatsApp</Label>
                  <Input
                    value={captureConfig.whatsapp_phone || whatsappNumber || ''}
                    onChange={(e) =>
                      setCaptureConfig((prev) => ({
                        ...prev,
                        whatsapp_phone: e.target.value || null,
                      }))
                    }
                    placeholder={whatsappNumber || '5511999999999'}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mensagem do WhatsApp</Label>
                  <Input
                    value={
                      captureConfig.whatsapp_followup_message ||
                      captureConfig.whatsapp_message ||
                      ''
                    }
                    onChange={(e) =>
                      setCaptureConfig((prev) => ({
                        ...prev,
                        whatsapp_followup_message: e.target.value || null,
                      }))
                    }
                    placeholder="Olá! Acabei de enviar o formulário…"
                  />
                </div>
              </>
            ) : null}

            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                disabled={!hub?.slug || !hasCrm}
                onClick={async () => {
                  if (!hub?.slug) return;
                  const result = await CaptureService.validateCapture(hub.slug);
                  if (result.ready || result.ok) {
                    toast.success(result.message || 'Formulário pronto para receber contatos.');
                  } else {
                    const issues = result.issues?.length
                      ? result.issues.join(' ')
                      : result.error || 'Corrija a configuração.';
                    toast.error(result.message || 'Corrija os seguintes itens:', {
                      description: issues,
                    });
                  }
                }}
              >
                Verificar configuração
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!hub?.slug || !hasCrm || hub.status !== 'published'}
                onClick={async () => {
                  if (!hub?.slug) return;
                  const result = await CaptureService.submitTestLead(hub.slug);
                  if (!result.ok) {
                    toast.error(result.error || 'Falha no teste', {
                      description: result.request_id
                        ? `Código: ${result.request_id}`
                        : undefined,
                    });
                    return;
                  }
                  toast.success(result.message || 'Lead de teste criado.', {
                    description: result.stage
                      ? `Etapa: ${result.stage}. Procure no CRM por “TESTE Smart Hub”.`
                      : 'Procure no CRM por “TESTE Smart Hub”.',
                  });
                }}
              >
                Enviar lead de teste
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-6 rounded-lg border bg-card p-4 sm:p-6">
        <div>
          <h3 className="text-sm font-semibold">SEO</h3>
          <p className="text-xs text-muted-foreground">Título e descrição para buscadores.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="seo_title">SEO Title</Label>
          <Input
            id="seo_title"
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="seo_description">SEO Description</Label>
          <Textarea
            id="seo_description"
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!canEditHub || updateHub.isPending || imageBusy || bookingCheckBusy}
          onClick={() => void saveSettings()}
        >
          {updateHub.isPending || bookingCheckBusy ? 'Salvando…' : 'Salvar configurações'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="lg:hidden"
          onClick={() => setMobilePreviewOpen(true)}
        >
          <Eye className="mr-2 h-4 w-4" />
          Ver prévia
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <SmartHubLayout
      title="Configurações"
      description="Identidade, visual, contatos, SEO e fluxo de publicação."
    >
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : !hub ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Crie um Smart Hub no Dashboard para configurar.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">{formSection}</div>

            <aside className="hidden w-[min(100%,440px)] shrink-0 lg:block">
              <div className="sticky top-4 space-y-2">
                <h3 className="text-sm font-semibold">Prévia ao vivo</h3>
                {previewControls}
                <div className="rounded-2xl bg-muted/50 p-3">
                  {previewBody}
                </div>
              </div>
            </aside>
          </div>

          <Sheet open={mobilePreviewOpen} onOpenChange={setMobilePreviewOpen}>
            <SheetContent
              side="bottom"
              className="h-[92vh] overflow-y-auto px-3 sm:max-w-none"
            >
              <SheetHeader>
                <SheetTitle>Prévia</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3">
                {previewControls}
                {previewBody}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </SmartHubLayout>
  );
}

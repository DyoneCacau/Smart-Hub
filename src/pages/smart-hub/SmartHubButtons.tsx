import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Info, Pencil, Plus, Trash2 } from 'lucide-react';
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
import {
  BUTTON_FIELD_HELP,
  CLICK_ACTION_HELP,
  buttonEditorShortSummary,
  ownerFieldGuidance,
} from '@/components/smart-hub/buttonEditorCopy';
import {
  getCompatibleActions,
  getRecommendedAction,
  isActionCompatible,
} from '@/components/smart-hub/buttonTypeActionMap';
import {
  applyButtonIntent,
  inferButtonIntent,
  intentOptionById,
  isLegacyButtonIntent,
  isSelectableButtonIntent,
  listContactMethods,
  listVisibleIntents,
  SOCIAL_NETWORK_OPTIONS,
  CONTACT_METHOD_ONLINE_BOOKING,
  SUGGESTED_APPOINTMENT_FORM_TITLE,
  shouldSuggestAppointmentFormTitle,
  isPublicBookingEnabled,
  type ButtonIntentId,
  type ContactMethodId,
  type SocialNetworkId,
} from '@/components/smart-hub/buttonIntentOptions';
import { useSmartHub } from '@/hooks/useSmartHub';
import { useHubButtons } from '@/hooks/useHubButtons';
import { useClinic } from '@/hooks/useClinic';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import {
  AssetService,
  buildDestinationUrl,
  resolveClickAction,
  validateSocialDomain,
  buildButtonCaptureConfig,
  resolveCaptureConfig,
  assertValidOwnerInput,
} from '@/services/smartHub';
import {
  SMART_HUB_BUTTON_TYPE_LABELS,
  SMART_HUB_VARIANT_LABELS,
  SMART_HUB_CLICK_ACTION_LABELS,
  type SmartHubButton,
  type SmartHubButtonType,
  type SmartHubButtonVisualVariant,
  type SmartHubClickAction,
  type SmartHubButtonCaptureConfig,
} from '@/types/smartHub';
import { CRM_STAGES } from '@/types/crm';
import { useClinicStaffOptions } from '@/hooks/useClinicStaffOptions';
import { useSubscription } from '@/hooks/useSubscription';
import { cn } from '@/lib/utils';

const BUTTON_TYPES = Object.keys(SMART_HUB_BUTTON_TYPE_LABELS) as SmartHubButtonType[];
const VARIANT_KEYS = Object.keys(SMART_HUB_VARIANT_LABELS) as SmartHubButtonVisualVariant[];

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

const emptyForm = {
  title: '',
  subtitle: '',
  type: 'form' as SmartHubButtonType,
  url: '',
  whatsapp_message: '',
  visual_variant: 'simple' as SmartHubButtonVisualVariant,
  click_action: 'form' as SmartHubClickAction,
  icon: '',
  image: '',
  image_alt: '',
  visible: true,
  order_index: 0,
  track_click: true,
  background_color: '',
  text_color: '',
  capture_interest: '',
  capture_stage: 'new' as string,
  capture_owner: '',
  capture_redirect_wa: false,
  capture_wa_phone: '',
  capture_wa_message: '',
  capture_use_hub_defaults: true,
  open_in_new_tab: true,
  email_subject: '',
};

type FormState = typeof emptyForm;

export default function SmartHubButtons() {
  const { clinicId } = useClinic();
  const { user } = useAuth();
  const { hasFeature } = useSubscription();
  const hasCrm = hasFeature('crm');
  const { staff } = useClinicStaffOptions();
  const { hub, isLoading } = useSmartHub();
  const { buttons, isLoading: loadingButtons, createButton, updateButton, deleteButton } =
    useHubButtons(hub?.id);
  const bookingEnabled = isPublicBookingEnabled(hub);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SmartHubButton | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [uploadingImage, setUploadingImage] = useState(false);
  /** Usuário alterou a ação manualmente — não sobrescrever ao mudar o tipo. */
  const [actionManuallySet, setActionManuallySet] = useState(false);
  /** Libera todas as ações (combinações avançadas). */
  const [customActions, setCustomActions] = useState(false);
  /** Intenção amigável (UI); type/click_action permanecem o contrato interno. */
  const [buttonIntent, setButtonIntent] = useState<ButtonIntentId>('capture_form');
  const [socialNetwork, setSocialNetwork] = useState<SocialNetworkId>('instagram');
  const [contactMethod, setContactMethod] = useState<ContactMethodId>('form');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(false);

  const effectiveAction = resolveClickAction(form.click_action, form.type);
  const availableActions = useMemo(() => {
    const list = getCompatibleActions(form.type, customActions).filter((a) =>
      a === 'booking' ? bookingEnabled : true
    );
    return hasCrm ? list : list.filter((a) => a !== 'form');
  }, [form.type, customActions, hasCrm, bookingEnabled]);
  const visibleIntents = useMemo(() => listVisibleIntents(hasCrm), [hasCrm]);
  const contactMethodOptions = useMemo(() => listContactMethods(hasCrm), [hasCrm]);
  const actionIsSuggested =
    !actionManuallySet &&
    !customActions &&
    form.click_action === getRecommendedAction(form.type);
  const actionHelp = CLICK_ACTION_HELP[effectiveAction] || CLICK_ACTION_HELP.auto;
  const isFormAction = effectiveAction === 'form' && hasCrm;
  const isBookingAction = effectiveAction === 'booking' && bookingEnabled;
  const isWhatsApp = effectiveAction === 'whatsapp';
  const isLink = effectiveAction === 'link';
  const isPhone = effectiveAction === 'phone';
  const isEmail = effectiveAction === 'email';
  const isMap = effectiveAction === 'map';
  const isInfo = effectiveAction === 'info';
  const isSocialIntent = buttonIntent === 'social';
  const isAppointmentOrProcedure =
    buttonIntent === 'appointment' || buttonIntent === 'procedure';
  const showFallbackDestination =
    !isFormAction &&
    !isBookingAction &&
    !isWhatsApp &&
    !isLink &&
    !isPhone &&
    !isEmail &&
    !isMap &&
    !isInfo;

  const applyIntentToForm = (
    intent: ButtonIntentId,
    nextSocial: SocialNetworkId = socialNetwork,
    nextMethod: ContactMethodId = contactMethod
  ) => {
    const applied = applyButtonIntent(intent, {
      socialNetwork: nextSocial,
      contactMethod: nextMethod,
      hasCrm,
    });
    setButtonIntent(intent);
    setActionManuallySet(false);
    setCustomActions(false);
    setAdvancedOpen(intent === 'advanced');
    setForm((f) => {
      const next = {
        ...f,
        type: applied.type,
        click_action: applied.click_action,
      };
      const isApptFlow = intent === 'appointment' || intent === 'procedure';
      if (isApptFlow && nextMethod === 'form' && shouldSuggestAppointmentFormTitle(f.title)) {
        next.title = SUGGESTED_APPOINTMENT_FORM_TITLE;
      }
      return next;
    });
  };

  const hubResolvedCapture = useMemo(
    () =>
      resolveCaptureConfig(hub?.capture_config, {
        use_hub_defaults: form.capture_use_hub_defaults,
        interest: form.capture_interest || null,
        initial_stage: form.capture_stage as SmartHubButtonCaptureConfig['initial_stage'],
        owner_user_id: form.capture_owner || null,
        redirect_whatsapp_after_submit: form.capture_redirect_wa,
        whatsapp_phone: form.capture_wa_phone || null,
        whatsapp_message: form.capture_wa_message || null,
      }),
    [
      hub?.capture_config,
      form.capture_use_hub_defaults,
      form.capture_interest,
      form.capture_stage,
      form.capture_owner,
      form.capture_redirect_wa,
      form.capture_wa_phone,
      form.capture_wa_message,
    ]
  );

  const ownerLabel = useMemo(() => {
    if (!hubResolvedCapture.owner_user_id) return 'Sem responsável';
    return staff.find((s) => s.id === hubResolvedCapture.owner_user_id)?.name || 'Responsável definido';
  }, [hubResolvedCapture.owner_user_id, staff]);

  const selectedCustomOwnerName = useMemo(() => {
    if (!form.capture_owner) return null;
    return staff.find((s) => s.id === form.capture_owner)?.name || null;
  }, [form.capture_owner, staff]);

  const ownerGuidance = ownerFieldGuidance({ ownerName: selectedCustomOwnerName });

  const stageLabel =
    CRM_STAGES.find((s) => s.id === hubResolvedCapture.initial_stage)?.label ||
    hubResolvedCapture.initial_stage;

  const openCreate = () => {
    setEditing(null);
    setActionManuallySet(false);
    setCustomActions(false);
    const defaultIntent: ButtonIntentId = hasCrm ? 'capture_form' : 'whatsapp';
    const defaultMethod: ContactMethodId = hasCrm ? 'form' : 'whatsapp';
    const applied = applyButtonIntent(defaultIntent, {
      hasCrm,
      contactMethod: defaultMethod,
      socialNetwork: 'instagram',
    });
    setButtonIntent(defaultIntent);
    setSocialNetwork('instagram');
    setContactMethod(defaultMethod);
    setAdvancedOpen(false);
    setTechnicalOpen(false);
    setForm({
      ...emptyForm,
      order_index: buttons.length,
      type: applied.type,
      click_action: applied.click_action,
    });
    setOpen(true);
  };

  const openEdit = (btn: SmartHubButton) => {
    setEditing(btn);
    const cap = (btn.capture_config || {}) as SmartHubButtonCaptureConfig;
    const rawAction = (btn.click_action as SmartHubClickAction) || 'auto';
    const type = btn.type as SmartHubButtonType;
    const concrete =
      rawAction === 'auto' ? getRecommendedAction(type) : rawAction;
    const unlocked =
      rawAction !== 'auto' && !isActionCompatible(type, concrete);
    const inferred = inferButtonIntent(type, concrete, { hasCrm });
    setCustomActions(unlocked || inferred.needsAdvanced);
    setActionManuallySet(
      rawAction !== 'auto' && concrete !== getRecommendedAction(type)
    );
    setButtonIntent(inferred.intent);
    setSocialNetwork(inferred.socialNetwork || 'instagram');
    setContactMethod(inferred.contactMethod || (hasCrm ? 'form' : 'link'));
    setAdvancedOpen(unlocked);
    setTechnicalOpen(false);
    setForm({
      title: btn.title,
      subtitle: btn.subtitle || '',
      type,
      url: btn.url || '',
      whatsapp_message: btn.whatsapp_message || '',
      visual_variant: (btn.visual_variant as SmartHubButtonVisualVariant) || 'simple',
      click_action: concrete,
      icon: btn.icon || '',
      image: btn.image || '',
      image_alt: btn.image_alt || '',
      visible: btn.visible,
      order_index: btn.order_index,
      track_click: btn.track_click,
      background_color: btn.background_color || '',
      text_color: btn.text_color || '',
      capture_interest: cap.interest || '',
      capture_stage: cap.initial_stage || hub?.capture_config?.initial_stage || 'new',
      capture_owner: cap.owner_user_id || '',
      capture_redirect_wa: Boolean(
        cap.redirect_whatsapp_after_submit ?? hub?.capture_config?.redirect_whatsapp_after_submit
      ),
      capture_wa_phone: cap.whatsapp_phone || hub?.capture_config?.whatsapp_phone || '',
      capture_wa_message:
        cap.whatsapp_message ||
        hub?.capture_config?.whatsapp_followup_message ||
        hub?.capture_config?.whatsapp_message ||
        '',
      capture_use_hub_defaults: resolveCaptureConfig(hub?.capture_config, cap).using_hub_defaults,
      open_in_new_tab: cap.open_in_new_tab !== false,
      email_subject: cap.email_subject || '',
    });
    setOpen(true);
  };

  const handleDialogOpenChange = (next: boolean) => {
    setOpen(next);
  };

  const validateForm = (): boolean => {
    if (!form.title.trim()) {
      toast.error('Informe o título do botão.');
      return false;
    }

    if (isFormAction) {
      if (
        !form.capture_use_hub_defaults &&
        form.capture_redirect_wa &&
        !form.capture_wa_phone.trim() &&
        !hub?.whatsapp_number
      ) {
        toast.error('Informe o telefone do WhatsApp após o envio.');
        return false;
      }
      return true;
    }

    if (isBookingAction || isInfo) return true;

    const destinationValue = form.url.trim();
    if (isWhatsApp || isPhone || isEmail || isLink || isMap) {
      if (!destinationValue) {
        toast.error(
          isWhatsApp || isPhone
            ? 'Informe o telefone.'
            : isEmail
              ? 'Informe o e-mail.'
              : isMap
                ? 'Informe a URL do mapa ou o endereço.'
                : 'Informe a URL.'
        );
        return false;
      }
    }

    const typeForUrl =
      isWhatsApp ? 'whatsapp' : isPhone ? 'phone' : isEmail ? 'email' : isMap ? 'map' : form.type;
    const socialError = validateSocialDomain(typeForUrl, form.url);
    if (socialError) {
      toast.error(socialError);
      return false;
    }

    if (destinationValue) {
      const href = buildDestinationUrl(
        typeForUrl,
        form.url,
        form.whatsapp_message,
        form.email_subject
      );
      if (!href) {
        toast.error('Informe um destino válido para o botão.');
        return false;
      }
    }

    if (
      ['whatsapp', 'phone', 'email', 'link'].includes(form.type) &&
      form.click_action === 'auto' &&
      !form.url.trim()
    ) {
      toast.error('Informe a URL ou destino do botão.');
      return false;
    }

    return true;
  };

  const save = async () => {
    if (!validateForm()) return;

    if (effectiveAction === 'form' && !hasCrm) {
      toast.error('O formulário de captação exige o módulo CRM no plano.');
      return;
    }

    if (effectiveAction === 'booking' && !bookingEnabled) {
      toast.error('Ative o agendamento online neste hub antes de usar esta opção.');
      return;
    }

    const ownerCheck = assertValidOwnerInput(
      form.capture_use_hub_defaults ? null : form.capture_owner
    );
    if (ownerCheck.ok === false) {
      toast.error(ownerCheck.message);
      return;
    }
    const ownerId = ownerCheck.owner;

    const capture_config = buildButtonCaptureConfig({
      interest: isFormAction ? form.capture_interest || null : null,
      useHubDefaults: isFormAction ? form.capture_use_hub_defaults : true,
      initial_stage: form.capture_stage,
      owner_user_id: ownerId,
      redirect_whatsapp_after_submit: form.capture_redirect_wa,
      whatsapp_phone: isFormAction
        ? form.capture_wa_phone || null
        : isWhatsApp
          ? form.url || null
          : null,
      whatsapp_message: isFormAction
        ? form.capture_wa_message || null
        : isWhatsApp
          ? form.whatsapp_message || null
          : null,
      open_in_new_tab: isWhatsApp || isLink ? form.open_in_new_tab : undefined,
      email_subject: isEmail ? form.email_subject || null : null,
      use_hub_form: isFormAction,
    });

    const payload = {
      title: form.title.trim(),
      subtitle: form.subtitle || null,
      type: form.type,
      url: isFormAction || isBookingAction ? null : form.url || null,
      whatsapp_message: isWhatsApp ? form.whatsapp_message || null : null,
      visual_variant: form.visual_variant,
      click_action: form.click_action,
      capture_config,
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
    type: form.type,
    click_action: form.click_action,
    visual_variant: form.visual_variant,
    url: form.url,
    whatsapp_message: isFormAction ? form.capture_wa_message : form.whatsapp_message,
    icon: form.icon,
    image: form.image,
    image_alt: form.image_alt,
    background_color: form.background_color || '#0F766E',
    text_color: form.text_color || '#FFFFFF',
    redirect_whatsapp: isFormAction && hubResolvedCapture.redirect_whatsapp_after_submit,
    email_subject: form.email_subject,
    open_in_new_tab: form.open_in_new_tab,
    interest: isFormAction ? form.capture_interest || null : null,
    stage_label: isFormAction ? stageLabel : null,
    owner_label: isFormAction ? ownerLabel : null,
    has_owner: isFormAction ? Boolean(hubResolvedCapture.owner_user_id) : false,
    show_crm_summary: isFormAction,
    intent: buttonIntent,
    social_network: isSocialIntent ? socialNetwork : null,
    contact_method: isAppointmentOrProcedure ? contactMethod : isFormAction ? 'form' : null,
    form_source_label: form.capture_use_hub_defaults ? 'Padrão do Smart Hub' : 'Personalizado neste botão',
    using_hub_form: isFormAction && form.capture_use_hub_defaults,
  };

  const isLegacyIntent = isLegacyButtonIntent(buttonIntent);
  const legacyIntentMeta = isLegacyIntent ? intentOptionById(buttonIntent) : undefined;
  const shortFooterSummary = buttonEditorShortSummary({
    action: effectiveAction,
    isAppointmentFlow: isAppointmentOrProcedure,
    redirectWhatsapp: Boolean(
      isFormAction && hubResolvedCapture.redirect_whatsapp_after_submit
    ),
  });

  const formFields = (
    <div className="space-y-5">
      <div className="space-y-2">
        <FieldHelpLabel htmlFor="btn-title" label="Título" help={BUTTON_FIELD_HELP.title} />
        <Input
          id="btn-title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder={
            isAppointmentOrProcedure && contactMethod === 'form'
              ? 'Ex.: Solicitar agendamento'
              : 'Ex.: Agendar consulta'
          }
        />
        {isAppointmentOrProcedure && contactMethod === 'form' ? (
          <div className="space-y-1.5">
            <FieldHint>{BUTTON_FIELD_HELP.title_form_appointment}</FieldHint>
            {shouldSuggestAppointmentFormTitle(form.title) &&
            form.title.trim() !== SUGGESTED_APPOINTMENT_FORM_TITLE ? (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs"
                onClick={() =>
                  setForm((f) => ({ ...f, title: SUGGESTED_APPOINTMENT_FORM_TITLE }))
                }
              >
                Usar “{SUGGESTED_APPOINTMENT_FORM_TITLE}”
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {!isInfo ? (
        <div className="space-y-2">
          <FieldHelpLabel
            htmlFor="btn-subtitle"
            label="Subtítulo"
            help={BUTTON_FIELD_HELP.subtitle}
          />
          <Input
            id="btn-subtitle"
            value={form.subtitle}
            onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
            placeholder="Ex.: Resposta em poucos minutos"
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <FieldHelpLabel label="O que este botão fará?" help={BUTTON_FIELD_HELP.intent} />
        {isLegacyIntent ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Ação legada</AlertTitle>
            <AlertDescription>
              Este botão usa “{legacyIntentMeta?.label || buttonIntent}”, uma opção que não está
              mais disponível para novos botões. Ele continua funcionando na página pública.
              Escolha uma das opções atuais para atualizar.
            </AlertDescription>
          </Alert>
        ) : null}
        {buttonIntent === 'advanced' ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Configuração personalizada</AlertTitle>
            <AlertDescription>
              Este botão usa uma combinação técnica avançada. Escolha uma opção abaixo ou ajuste
              em Configurações avançadas.
            </AlertDescription>
          </Alert>
        ) : null}
        <Select
          value={isSelectableButtonIntent(buttonIntent) ? buttonIntent : undefined}
          onValueChange={(v) => {
            const next = v as ButtonIntentId;
            const nextMethod =
              next === 'appointment' || next === 'procedure'
                ? contactMethod
                : hasCrm
                  ? 'form'
                  : 'link';
            if (next === 'appointment' || next === 'procedure') {
              setContactMethod(nextMethod);
            }
            applyIntentToForm(next, socialNetwork, nextMethod);
          }}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                isLegacyIntent
                  ? `Legado: ${legacyIntentMeta?.label || buttonIntent}`
                  : buttonIntent === 'advanced'
                    ? 'Escolha uma opção atual'
                    : 'Escolha o resultado do botão'
              }
            />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-80">
            {visibleIntents.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isSocialIntent ? (
        <div className="space-y-2">
          <FieldHelpLabel label="Qual rede social?" help={BUTTON_FIELD_HELP.intent_social} />
          <Select
            value={socialNetwork}
            onValueChange={(v) => {
              const next = v as SocialNetworkId;
              setSocialNetwork(next);
              applyIntentToForm('social', next, contactMethod);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {SOCIAL_NETWORK_OPTIONS.map((net) => (
                <SelectItem key={net.id} value={net.id}>
                  {net.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {isAppointmentOrProcedure ? (
        <div className="space-y-3">
          <FieldHelpLabel
            label={
              buttonIntent === 'appointment'
                ? 'Como o pedido de agendamento será realizado?'
                : 'Como o visitante entrará em contato?'
            }
            help={BUTTON_FIELD_HELP.intent_contact_method}
          />
          <Select
            value={
              contactMethod === 'online_booking'
                ? bookingEnabled
                  ? 'online_booking'
                  : contactMethodOptions[0]?.id || 'link'
                : contactMethodOptions.some((o) => o.id === contactMethod)
                  ? contactMethod
                  : contactMethodOptions[0]?.id || 'link'
            }
            onValueChange={(v) => {
              const next = v as ContactMethodId;
              if (next === 'online_booking' && !bookingEnabled) return;
              setContactMethod(next);
              applyIntentToForm(buttonIntent, socialNetwork, next);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {contactMethodOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.label}
                </SelectItem>
              ))}
              <SelectItem value={CONTACT_METHOD_ONLINE_BOOKING.id} disabled={!bookingEnabled}>
                <span className="flex items-center gap-1.5">
                  {CONTACT_METHOD_ONLINE_BOOKING.label}
                  {!bookingEnabled ? (
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {CONTACT_METHOD_ONLINE_BOOKING.badgeDisabled}
                    </Badge>
                  ) : null}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
          {!bookingEnabled ? (
            <p className="text-xs text-muted-foreground">
              Agendamento online desativado. Ative em Smart Hub → Configurações.
            </p>
          ) : null}
        </div>
      ) : null}

      {isFormAction ? (
        <div className="space-y-2">
          <FieldHelpLabel
            htmlFor="capture-interest"
            label="Serviço ou interesse"
            help={BUTTON_FIELD_HELP.capture_interest}
          />
          <Input
            id="capture-interest"
            value={form.capture_interest}
            onChange={(e) => setForm((f) => ({ ...f, capture_interest: e.target.value }))}
            placeholder="Ex.: Clareamento, Ortodontia…"
          />
        </div>
      ) : null}

      {isWhatsApp ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <FieldHelpLabel htmlFor="btn-phone" label="Telefone" help={BUTTON_FIELD_HELP.phone} />
            <Input
              id="btn-phone"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="5511999999999"
            />
          </div>
          <div className="space-y-2">
            <FieldHelpLabel
              htmlFor="wa-msg"
              label="Mensagem inicial"
              help={BUTTON_FIELD_HELP.whatsapp_message}
            />
            <Input
              id="wa-msg"
              value={form.whatsapp_message}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp_message: e.target.value }))}
              placeholder="Olá! Gostaria de agendar uma consulta."
            />
          </div>
        </div>
      ) : null}

      {isLink ? (
        <div className="space-y-2">
          <FieldHelpLabel
            htmlFor="btn-url"
            label={isSocialIntent ? 'URL do perfil ou conteúdo' : 'URL'}
            help={BUTTON_FIELD_HELP.url}
          />
          <Input
            id="btn-url"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder={
              isSocialIntent ? 'https://instagram.com/sua-clinica' : 'https://...'
            }
          />
        </div>
      ) : null}

      {isPhone ? (
        <div className="space-y-2">
          <FieldHelpLabel htmlFor="btn-tel" label="Telefone" help={BUTTON_FIELD_HELP.phone} />
          <Input
            id="btn-tel"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder="5511999999999"
          />
        </div>
      ) : null}

      {isEmail ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <FieldHelpLabel htmlFor="btn-email" label="E-mail" help={BUTTON_FIELD_HELP.email} />
            <Input
              id="btn-email"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="contato@clinica.com"
            />
          </div>
          <div className="space-y-2">
            <FieldHelpLabel
              htmlFor="email-subject"
              label="Assunto (opcional)"
              help={BUTTON_FIELD_HELP.email_subject}
            />
            <Input
              id="email-subject"
              value={form.email_subject}
              onChange={(e) => setForm((f) => ({ ...f, email_subject: e.target.value }))}
              placeholder="Agendamento pelo site"
            />
          </div>
        </div>
      ) : null}

      {isMap ? (
        <div className="space-y-2">
          <FieldHelpLabel
            htmlFor="btn-map"
            label="URL do mapa ou endereço"
            help={BUTTON_FIELD_HELP.map_url}
          />
          <Input
            id="btn-map"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder="https://maps.google.com/… ou Rua Exemplo, 123"
          />
        </div>
      ) : null}

      {isInfo ? (
        <div className="space-y-2">
          <FieldHelpLabel
            htmlFor="info-content"
            label="Conteúdo informativo"
            help={BUTTON_FIELD_HELP.info_content}
          />
          <Textarea
            id="info-content"
            value={form.subtitle}
            onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
            placeholder="Horário de atendimento, formas de pagamento…"
            rows={4}
          />
        </div>
      ) : null}

      {showFallbackDestination ? (
        <div className="space-y-2">
          <FieldHelpLabel htmlFor="btn-url-auto" label="URL / destino" help={BUTTON_FIELD_HELP.url} />
          <Input
            id="btn-url-auto"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder="https://..."
          />
        </div>
      ) : null}

      {isBookingAction ? (
        <p className="text-sm text-muted-foreground">
          O visitante agenda pelo wizard na própria página. Não é necessário link externo.
        </p>
      ) : null}

      <div className="space-y-3">
        <p className="text-sm font-medium">Aparência</p>
        <div className="space-y-2">
          <FieldHelpLabel label="Variante visual" help={BUTTON_FIELD_HELP.visual_variant} />
          <Select
            value={form.visual_variant}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                visual_variant: v as SmartHubButtonVisualVariant,
              }))
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
      </div>

      {/* Prévia no mobile fica abaixo; no desktop é renderizada na coluna direita do Dialog. */}
      <div className="lg:hidden">
        <ButtonEditorPreview model={previewModel} showActualColors />
      </div>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <div className="rounded-lg border px-3 py-2">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium"
            >
              Configurações avançadas
              {advancedOpen ? (
                <ChevronUp className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-5 border-t pt-3">
            {isFormAction ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium">Usar o formulário padrão da página</p>
                    <p className="text-xs text-muted-foreground">
                      {BUTTON_FIELD_HELP.capture_use_hub_defaults}
                    </p>
                  </div>
                  <Switch
                    checked={form.capture_use_hub_defaults}
                    onCheckedChange={(v) =>
                      setForm((f) => ({ ...f, capture_use_hub_defaults: v }))
                    }
                  />
                </div>

                {form.capture_use_hub_defaults ? (
                  <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-3 text-sm">
                    <p className="font-medium">Padrão do Smart Hub</p>
                    <p className="text-xs text-muted-foreground">Responsável: {ownerLabel}</p>
                    <p className="text-xs text-muted-foreground">Etapa inicial: {stageLabel}</p>
                    <Button type="button" variant="outline" size="sm" asChild>
                      <Link to="/smart-hub/configuracoes">Ver ou editar formulário padrão</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4 rounded-md border px-3 py-3">
                    <div className="space-y-2">
                      <FieldHelpLabel
                        label="Etapa inicial no CRM"
                        help={BUTTON_FIELD_HELP.capture_stage}
                      />
                      <Select
                        value={form.capture_stage}
                        onValueChange={(v) => setForm((f) => ({ ...f, capture_stage: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {CRM_STAGES.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <FieldHelpLabel
                        label="Quem receberá este lead"
                        help={BUTTON_FIELD_HELP.capture_owner}
                      />
                      <Select
                        value={form.capture_owner || '__none__'}
                        onValueChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            capture_owner: v === '__none__' ? '' : v,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sem responsável" />
                        </SelectTrigger>
                        <SelectContent position="popper" className="max-h-72">
                          <SelectItem value="__none__">Sem responsável</SelectItem>
                          {staff.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldHint>{ownerGuidance.primary}</FieldHint>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <FieldHelpLabel
                        label="Abrir WhatsApp depois do formulário"
                        help={BUTTON_FIELD_HELP.capture_redirect_wa}
                      />
                      <Switch
                        checked={form.capture_redirect_wa}
                        onCheckedChange={(v) =>
                          setForm((f) => ({ ...f, capture_redirect_wa: v }))
                        }
                      />
                    </div>
                    {form.capture_redirect_wa ? (
                      <>
                        <div className="space-y-2">
                          <FieldHelpLabel
                            htmlFor="capture-wa-phone"
                            label="Telefone do WhatsApp após envio"
                            help={BUTTON_FIELD_HELP.capture_wa_phone}
                          />
                          <Input
                            id="capture-wa-phone"
                            value={form.capture_wa_phone}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, capture_wa_phone: e.target.value }))
                            }
                            placeholder={hub?.whatsapp_number || '5511999999999'}
                          />
                        </div>
                        <div className="space-y-2">
                          <FieldHelpLabel
                            htmlFor="capture-wa-msg"
                            label="Mensagem após envio"
                            help={BUTTON_FIELD_HELP.capture_wa_message}
                          />
                          <Input
                            id="capture-wa-msg"
                            value={form.capture_wa_message}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, capture_wa_message: e.target.value }))
                            }
                            placeholder="Olá! Acabei de enviar o formulário pelo site."
                          />
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {(isWhatsApp || isLink) && (
              <div className="flex items-center justify-between gap-2">
                <FieldHelpLabel
                  label="Abrir em nova aba"
                  help={BUTTON_FIELD_HELP.open_in_new_tab}
                />
                <Switch
                  checked={form.open_in_new_tab}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, open_in_new_tab: v }))}
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <FieldHelpLabel
                  htmlFor="btn-order"
                  label="Ordem"
                  help={BUTTON_FIELD_HELP.order_index}
                />
                <Input
                  id="btn-order"
                  type="number"
                  value={form.order_index}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, order_index: Number(e.target.value) || 0 }))
                  }
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
                <div className="space-y-2 rounded-md border border-dashed bg-muted/20 px-3 py-3">
                  <p className="text-sm text-muted-foreground">
                    Salve o botão primeiro para enviar uma imagem pelo upload.
                  </p>
                  <Button type="button" variant="outline" size="sm" disabled>
                    Adicionar imagem após salvar
                  </Button>
                  {form.image ? (
                    <div className="space-y-2 pt-1">
                      <img
                        src={form.image}
                        alt={form.image_alt || form.title || 'Prévia da imagem'}
                        className="h-16 w-16 rounded-md border object-cover"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto px-0 text-destructive"
                        onClick={() => setForm((f) => ({ ...f, image: '', image_alt: '' }))}
                      >
                        Remover imagem
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <Collapsible open={technicalOpen} onOpenChange={setTechnicalOpen}>
              <div className="rounded-md border px-3 py-2">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium"
                  >
                    Configuração técnica
                    {technicalOpen ? (
                      <ChevronUp className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-5 border-t pt-3">
                  <p className="text-xs text-muted-foreground">{BUTTON_FIELD_HELP.advanced_type}</p>
                  {!customActions && buttonIntent !== 'advanced' ? (
                    <div className="space-y-3 rounded-md border bg-muted/20 px-3 py-3 text-sm">
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Tipo técnico
                        </p>
                        <p className="font-medium">
                          {SMART_HUB_BUTTON_TYPE_LABELS[form.type] || form.type}
                        </p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Ação ao clicar
                        </p>
                        <p className="font-medium">
                          {SMART_HUB_CLICK_ACTION_LABELS[form.click_action] || form.click_action}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setCustomActions(true);
                          setAdvancedOpen(true);
                          setTechnicalOpen(true);
                        }}
                      >
                        Alterar configuração técnica
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <FieldHelpLabel label="Tipo técnico" help={BUTTON_FIELD_HELP.type_tooltip} />
                        <Select
                          value={form.type}
                          onValueChange={(v) => {
                            const nextType = v as SmartHubButtonType;
                            const keepAction =
                              customActions ||
                              (actionManuallySet &&
                                isActionCompatible(nextType, form.click_action));
                            const nextAction = keepAction
                              ? form.click_action
                              : getRecommendedAction(nextType);
                            if (!keepAction && actionManuallySet) {
                              setActionManuallySet(false);
                            }
                            const inferred = inferButtonIntent(nextType, nextAction, { hasCrm });
                            setButtonIntent(inferred.intent);
                            if (inferred.socialNetwork) setSocialNetwork(inferred.socialNetwork);
                            if (inferred.contactMethod) setContactMethod(inferred.contactMethod);
                            setForm((f) => ({
                              ...f,
                              type: nextType,
                              click_action: nextAction,
                            }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent position="popper" className="max-h-72">
                            {BUTTON_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {SMART_HUB_BUTTON_TYPE_LABELS[t]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {form.type === 'internal' ? (
                          <FieldHint>{BUTTON_FIELD_HELP.type_internal}</FieldHint>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <FieldHelpLabel
                          label="Ação ao clicar (técnica)"
                          help={BUTTON_FIELD_HELP.click_action}
                        />
                        <Select
                          value={
                            availableActions.includes(form.click_action)
                              ? form.click_action
                              : availableActions[0] || form.click_action
                          }
                          onValueChange={(v) => {
                            const nextAction = v as SmartHubClickAction;
                            setActionManuallySet(true);
                            setForm((f) => ({ ...f, click_action: nextAction }));
                            const inferred = inferButtonIntent(form.type, nextAction, { hasCrm });
                            setButtonIntent(inferred.intent);
                            if (inferred.contactMethod) setContactMethod(inferred.contactMethod);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent position="popper" className="max-h-72">
                            {availableActions.map((a) => (
                              <SelectItem key={a} value={a} disabled={a === 'form' && !hasCrm}>
                                {SMART_HUB_CLICK_ACTION_LABELS[a]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {actionIsSuggested ? (
                          <FieldHint>{BUTTON_FIELD_HELP.action_suggested}</FieldHint>
                        ) : (
                          <FieldHint>{actionHelp.description}</FieldHint>
                        )}
                        <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-sm font-medium">Configuração personalizada</p>
                            <p className="text-xs text-muted-foreground">
                              {BUTTON_FIELD_HELP.action_custom}
                            </p>
                          </div>
                          <Switch
                            checked={customActions}
                            onCheckedChange={(v) => {
                              setCustomActions(v);
                              if (!v && !isActionCompatible(form.type, form.click_action)) {
                                setActionManuallySet(false);
                                setForm((f) => ({
                                  ...f,
                                  click_action: getRecommendedAction(f.type),
                                }));
                              }
                            }}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <FieldHelpLabel
                      htmlFor="img-url-advanced"
                      label="URL da imagem (avançado)"
                      help={BUTTON_FIELD_HELP.image}
                    />
                    <Input
                      id="img-url-advanced"
                      value={form.image}
                      onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
                      placeholder="Somente se precisar colar uma URL existente"
                    />
                    <FieldHint>
                      Preferível usar o upload acima. Este campo é só para casos técnicos.
                    </FieldHint>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );

  return (
    <SmartHubLayout
      title="Botões"
      description="Gerencie os botões de conversão da página pública."
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
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
                    —
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium">{btn.title}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {SMART_HUB_BUTTON_TYPE_LABELS[btn.type] || btn.type}
                    {btn.url ? ` · ${btn.url}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">#{btn.order_index}</Badge>
                <Badge variant="secondary">
                  {SMART_HUB_VARIANT_LABELS[
                    btn.visual_variant as SmartHubButtonVisualVariant
                  ] ||
                    btn.visual_variant ||
                    'Simples'}
                </Badge>
                <Badge variant={btn.visible ? 'default' : 'secondary'}>
                  {btn.visible ? 'Visível' : 'Oculto'}
                </Badge>
                <Button variant="ghost" size="icon" onClick={() => openEdit(btn)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
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
                Crie o primeiro botão (formulário, WhatsApp, agendamento ou link) para ativar a
                conversão na página pública.
              </p>
              <Button className="mt-4" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Criar primeiro botão
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className={cn(
            'flex max-h-[min(92vh,100dvh)] flex-col gap-0 overflow-hidden p-0',
            'w-[calc(100vw-1.5rem)] max-w-lg sm:max-w-3xl lg:max-w-4xl'
          )}
        >
          <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-3 text-left sm:px-5 sm:py-4">
            <DialogTitle>{editing ? 'Editar botão' : 'Novo botão'}</DialogTitle>
            <DialogDescription>
              Configure o título, a ação e a aparência do botão.
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

          <DialogFooter
            className={cn(
              'shrink-0 flex-col gap-3 border-t bg-background px-4 py-3 sm:px-5 sm:py-4',
              'pb-[max(0.75rem,env(safe-area-inset-bottom))]'
            )}
          >
            <p className="w-full text-left text-sm leading-snug text-muted-foreground">
              {shortFooterSummary}
            </p>
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  !form.title.trim() || createButton.isPending || updateButton.isPending
                }
                onClick={save}
              >
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SmartHubLayout>
  );
}

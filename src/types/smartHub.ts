/** Tipos do módulo Healthcare Smart Hub (Fase 1 + 2 + 2.1) */

export type SmartHubStatus = 'draft' | 'published' | 'offline' | 'archived';
export type SmartHubPageStatus = 'draft' | 'published' | 'archived';
export type SmartHubButtonType =
  | 'link'
  | 'whatsapp'
  | 'phone'
  | 'email'
  | 'map'
  | 'video'
  | 'form'
  | 'internal'
  | 'social'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'youtube'
  | 'site'
  | 'appointment'
  | 'procedure'
  | 'info';
export type SmartHubButtonStatus = 'active' | 'inactive' | 'archived';
export type SmartHubEntityStatus = 'active' | 'inactive' | 'archived' | 'pending' | 'error';

export type SmartHubButtonVisualVariant =
  | 'simple'
  | 'icon_card'
  | 'image_card'
  | 'horizontal_card'
  | 'featured_card'
  | 'list_item'
  | 'grid';

/** Ação ao clicar no botão (ortogonal ao type visual). */
export type SmartHubClickAction =
  | 'auto'
  | 'form'
  | 'whatsapp'
  | 'link'
  | 'phone'
  | 'email'
  | 'map'
  | 'info'
  | 'booking';

export type SmartHubCaptureMode = 'form_crm' | 'whatsapp_direct';

export type SmartHubFormFieldKey =
  | 'name'
  | 'whatsapp'
  | 'email'
  | 'interest'
  | 'message'
  | 'preferred_time'
  | 'preferred_date'
  | 'privacy';

export interface SmartHubFormFieldConfig {
  key: SmartHubFormFieldKey;
  visible: boolean;
  required: boolean;
  label: string;
  placeholder?: string;
  order: number;
}

export interface SmartHubCaptureConfig {
  mode?: SmartHubCaptureMode;
  /** Etapa inicial do Kanban (stage do CRM) */
  initial_stage?: 'new' | 'contact' | 'scheduled' | 'won' | 'lost';
  default_owner_user_id?: string | null;
  form_title?: string;
  form_description?: string;
  submit_label?: string;
  success_message?: string;
  redirect_url?: string | null;
  redirect_whatsapp_after_submit?: boolean;
  whatsapp_phone?: string | null;
  whatsapp_message?: string | null;
  whatsapp_followup_message?: string | null;
  require_privacy_accept?: boolean;
  privacy_text?: string;
  privacy_url?: string | null;
  privacy_version?: string;
  fields?: SmartHubFormFieldConfig[];
  dedupe_mode?: 'update' | 'activity' | 'create' | 'block';
  manual_copy_message?: string | null;
}

export interface SmartHubButtonCaptureConfig {
  use_hub_form?: boolean;
  /** Quando true, usa etapa/responsável/WhatsApp do Hub (não duplica no botão). */
  use_hub_defaults?: boolean;
  initial_stage?: 'new' | 'contact' | 'scheduled' | 'won' | 'lost';
  owner_user_id?: string | null;
  interest?: string | null;
  redirect_whatsapp_after_submit?: boolean;
  redirect_url?: string | null;
  whatsapp_phone?: string | null;
  whatsapp_message?: string | null;
  include_hub_name?: boolean;
  include_service_name?: boolean;
  open_in_new_tab?: boolean;
  /** Assunto opcional para ação e-mail (mailto). */
  email_subject?: string | null;
}

export type SmartHubStylePreset =
  | 'clean'
  | 'elegant'
  | 'colorful'
  | 'minimal'
  | 'premium'
  | 'whatsapp';

export type SmartHubAssetKind = 'logo' | 'banner' | 'profile' | 'button' | 'background' | 'other';

export type SmartHubLayoutBlock =
  | 'banner'
  | 'logo'
  | 'header'
  | 'description'
  | 'whatsapp'
  | 'contact'
  | 'map'
  | 'buttons'
  | 'grid'
  | 'social'
  | 'footer'
  | string;

export interface SmartHubVisualConfig {
  background_color?: string;
  text_color?: string;
  button_bg_color?: string;
  button_text_color?: string;
  card_bg_color?: string;
  border_color?: string;
  background_mode?: 'solid' | 'gradient' | 'image';
  gradient_from?: string;
  gradient_to?: string;
  banner_overlay_color?: string;
  banner_overlay_opacity?: number;
  content_align?: 'left' | 'center' | 'right';
  max_width?: 'sm' | 'md' | 'lg';
  font_weight_title?: 'normal' | 'medium' | 'semibold' | 'bold';
  border_radius?: 'none' | 'md' | 'lg' | 'xl' | 'full';
  shadow_style?: 'none' | 'sm' | 'md' | 'lg';
  spacing?: 'compact' | 'normal' | 'relaxed';
  floating_whatsapp?: boolean;
}

export interface SmartHubValidationIssue {
  code: string;
  message: string;
}

export interface SmartHubValidationResult {
  ok: boolean;
  errors: SmartHubValidationIssue[];
  warnings: SmartHubValidationIssue[];
  visible_buttons?: number;
}

export interface SmartHubPublishResult {
  ok: boolean;
  status: SmartHubStatus | string;
  validation?: SmartHubValidationResult;
}

export interface SmartHub {
  id: string;
  clinic_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  background_url: string | null;
  profile_url: string | null;
  theme: string;
  primary_color: string;
  secondary_color: string;
  font_family: string;
  seo_title: string | null;
  seo_description: string | null;
  favicon_url: string | null;
  status: SmartHubStatus;
  template_id: string | null;
  published_at: string | null;
  paused_at: string | null;
  last_validated_at: string | null;
  validation_errors: SmartHubValidationIssue[] | unknown[];
  whatsapp_number: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_address: string | null;
  map_embed_url: string | null;
  layout_blocks: SmartHubLayoutBlock[];
  style_preset: SmartHubStylePreset | string;
  visual_config: SmartHubVisualConfig;
  capture_config?: SmartHubCaptureConfig;
  /** Gate do agendamento online (Fase B). Ausente/false = wizard e opção do editor desligados. */
  public_booking_enabled?: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export interface SmartHubPage {
  id: string;
  clinic_id: string;
  hub_id: string;
  title: string;
  slug: string;
  layout_json: Record<string, unknown>;
  is_home: boolean;
  status: SmartHubPageStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export interface SmartHubButton {
  id: string;
  clinic_id: string;
  hub_id: string;
  title: string;
  subtitle: string | null;
  icon: string | null;
  type: SmartHubButtonType;
  url: string | null;
  image: string | null;
  image_alt: string | null;
  visual_variant: SmartHubButtonVisualVariant | string;
  image_position: 'left' | 'top' | 'right' | 'background' | string;
  whatsapp_message: string | null;
  click_action?: SmartHubClickAction | string;
  capture_config?: SmartHubButtonCaptureConfig;
  background_color: string | null;
  text_color: string | null;
  visible: boolean;
  order_index: number;
  track_click: boolean;
  status: SmartHubButtonStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export interface SmartHubTemplate {
  id: string;
  name: string;
  description: string | null;
  thumbnail: string | null;
  json_layout: Record<string, unknown>;
  is_default: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export interface SmartHubTheme {
  id: string;
  clinic_id: string;
  hub_id: string;
  theme_name: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string | null;
  background_color: string | null;
  text_color: string | null;
  button_radius: string;
  font_family: string;
  custom_css: string | null;
  config_json: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export interface SmartHubAsset {
  id: string;
  clinic_id: string;
  hub_id: string;
  file_name: string;
  file_type: string | null;
  storage_path: string;
  public_url: string | null;
  asset_kind: SmartHubAssetKind | string;
  status: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export interface SmartHubDomain {
  id: string;
  clinic_id: string;
  hub_id: string;
  domain: string;
  is_primary: boolean;
  is_verified: boolean;
  verification_token: string | null;
  ssl_status: string;
  status: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export interface SmartHubVisit {
  id: string;
  clinic_id: string;
  hub_id: string;
  visitor_id: string | null;
  session_id: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SmartHubClick {
  id: string;
  clinic_id: string;
  hub_id: string;
  button_id: string | null;
  visit_id: string | null;
  target_url: string | null;
  device_type: string | null;
  referrer: string | null;
  utm_campaign: string | null;
  metadata: Record<string, unknown> | null;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SmartHubEvent {
  id: string;
  clinic_id: string;
  hub_id: string;
  event_type: string;
  event_name: string | null;
  payload: Record<string, unknown>;
  visit_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PublicSmartHubPayload {
  hub: SmartHub;
  theme: SmartHubTheme | null;
  buttons: SmartHubButton[];
  page: SmartHubPage | null;
  assets: SmartHubAsset[];
  preview?: boolean;
}

export interface SmartHubDashboardMetrics {
  publicUrl: string;
  status: SmartHubStatus;
  online: boolean;
  views: number;
  clicks: number;
  leads: number;
  appointments: number;
  conversions: number;
  ctr: number;
  topButton: string | null;
  mainOrigin: string | null;
  mainDevice: string | null;
  mainCampaign: string | null;
  lastVisitAt: string | null;
  whatsappClicks?: number;
  formsOpened?: number;
  formsSubmitted?: number;
  leadsUpdated?: number;
  submitRate?: number;
  conversionRate?: number;
}

export interface ListQueryParams {
  clinicId: string;
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  orderBy?: string;
  ascending?: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type SmartHubInsert = Partial<SmartHub> & {
  clinic_id: string;
  slug: string;
  title: string;
};

export type SmartHubUpdate = Partial<Omit<SmartHub, 'id' | 'clinic_id' | 'created_at'>>;

export type SmartHubButtonInsert = Partial<SmartHubButton> & {
  clinic_id: string;
  hub_id: string;
  title: string;
};

export type SmartHubButtonUpdate = Partial<
  Omit<SmartHubButton, 'id' | 'clinic_id' | 'hub_id' | 'created_at'>
>;

export const SMART_HUB_STATUS_LABELS: Record<SmartHubStatus, string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  offline: 'Pausado',
  archived: 'Arquivado',
};

export const SMART_HUB_BUTTON_TYPE_LABELS: Record<SmartHubButtonType, string> = {
  link: 'Link ou site',
  whatsapp: 'WhatsApp',
  phone: 'Telefone',
  email: 'E-mail',
  map: 'Localização',
  video: 'Vídeo',
  form: 'Formulário',
  internal: 'Página interna',
  social: 'Rede social',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  site: 'Site',
  appointment: 'Agendamento',
  procedure: 'Procedimentos',
  info: 'Texto informativo',
};

export const SMART_HUB_VARIANT_LABELS: Record<SmartHubButtonVisualVariant, string> = {
  simple: 'Botão simples',
  icon_card: 'Card com ícone',
  image_card: 'Card com imagem',
  horizontal_card: 'Card horizontal',
  featured_card: 'Card destacado',
  list_item: 'Item de lista',
  grid: 'Grid',
};

export const SMART_HUB_CLICK_ACTION_LABELS: Record<SmartHubClickAction, string> = {
  auto: 'Automático (conforme o tipo)',
  form: 'Abrir formulário de captação',
  whatsapp: 'Abrir WhatsApp',
  link: 'Abrir link externo',
  phone: 'Fazer ligação',
  email: 'Enviar e-mail',
  map: 'Abrir localização',
  info: 'Exibir informação',
  booking: 'Agendamento online pelo sistema',
};

export const SMART_HUB_CAPTURE_MODE_LABELS: Record<SmartHubCaptureMode, string> = {
  form_crm: 'Formulário integrado ao CRM',
  whatsapp_direct: 'WhatsApp direto',
};

export const SMART_HUB_STYLE_PRESET_LABELS: Record<SmartHubStylePreset, string> = {
  clean: 'Clean',
  elegant: 'Elegante',
  colorful: 'Colorido',
  minimal: 'Minimalista',
  premium: 'Premium',
  whatsapp: 'WhatsApp',
};

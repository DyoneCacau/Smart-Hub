/**
 * Repositórios do Smart Hub sem backend: mesmos contratos dos repositórios Supabase,
 * com os dados no localStorage e as regras das RPCs (validação, publicação, templates)
 * reproduzidas aqui.
 */
import { createLocalId, readLocalList, writeLocal } from '@/lib/localStore';
import { normalizeSlug } from '@/services/smartHub/slugUtils';
import {
  compressImageToWebp,
  normalizeAssetFileName,
  validateSmartHubImage,
} from '@/services/smartHub/imageUtils';
import type {
  ListQueryParams,
  PaginatedResult,
  PublicSmartHubPayload,
  SmartHub,
  SmartHubAsset,
  SmartHubAssetKind,
  SmartHubButton,
  SmartHubButtonInsert,
  SmartHubButtonUpdate,
  SmartHubClick,
  SmartHubDashboardMetrics,
  SmartHubDomain,
  SmartHubEvent,
  SmartHubInsert,
  SmartHubLayoutBlock,
  SmartHubPage,
  SmartHubStatus,
  SmartHubTemplate,
  SmartHubTheme,
  SmartHubUpdate,
  SmartHubValidationIssue,
  SmartHubVisit,
} from '@/types/smartHub';

export const SMART_HUB_STORAGE_KEYS = {
  hubs: 'smart-hub:hubs',
  pages: 'smart-hub:pages',
  buttons: 'smart-hub:buttons',
  themes: 'smart-hub:themes',
  assets: 'smart-hub:assets',
  domains: 'smart-hub:domains',
  visits: 'smart-hub:visits',
  clicks: 'smart-hub:clicks',
  events: 'smart-hub:events',
  leads: 'smart-hub:leads',
} as const;

const DEFAULT_BLOCKS: SmartHubLayoutBlock[] = ['header', 'logo', 'description', 'buttons', 'footer'];

const TEMPLATE_TIMESTAMP = '2026-07-28T12:00:00.000Z';

function template(
  id: string,
  name: string,
  description: string,
  isDefault: boolean,
  blocks: string[],
  preview: Record<string, unknown>
): SmartHubTemplate {
  return {
    id,
    name,
    description,
    thumbnail: null,
    json_layout: { version: 1, blocks, preview },
    is_default: isDefault,
    status: 'active',
    created_at: TEMPLATE_TIMESTAMP,
    updated_at: TEMPLATE_TIMESTAMP,
    created_by: null,
    updated_by: null,
    deleted_at: null,
  };
}

const TEMPLATES: SmartHubTemplate[] = [
  template(
    'template-classico',
    'Clássico',
    'Layout limpo com logo, descrição e botões empilhados.',
    true,
    ['banner', 'logo', 'header', 'description', 'buttons', 'contact', 'social', 'footer'],
    { banner: true, profile: true, whatsapp_featured: false, grid: false, style: 'classic' }
  ),
  template(
    'template-banner-grid',
    'Banner + Grid',
    'Banner no topo com grid de botões e links sociais.',
    false,
    ['banner', 'logo', 'header', 'grid', 'social', 'contact', 'footer'],
    { banner: true, profile: true, whatsapp_featured: false, grid: true, style: 'banner_grid' }
  ),
  template(
    'template-whatsapp-first',
    'WhatsApp First',
    'Foco em conversão via WhatsApp com contato e mapa.',
    false,
    ['banner', 'logo', 'header', 'whatsapp', 'contact', 'buttons', 'social', 'map', 'footer'],
    {
      banner: true,
      profile: true,
      whatsapp_featured: true,
      grid: false,
      style: 'whatsapp_first',
      floating_whatsapp: true,
    }
  ),
];

type Row = { id: string; deleted_at?: string | null };

function nowIso(): string {
  return new Date().toISOString();
}

function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

function table<T extends Row>(key: string) {
  return {
    all(): T[] {
      return readLocalList<T>(key);
    },
    active(filter: (row: T) => boolean = () => true): T[] {
      return readLocalList<T>(key).filter((row) => !row.deleted_at && filter(row));
    },
    insert(row: T): T {
      writeLocal(key, [...readLocalList<T>(key), row]);
      return row;
    },
    replaceAll(rows: T[]) {
      writeLocal(key, rows);
    },
    patch(match: (row: T) => boolean, changes: Partial<T>): T[] {
      const updated: T[] = [];
      const rows = readLocalList<T>(key).map((row) => {
        if (row.deleted_at || !match(row)) return row;
        const next = { ...row, ...changes };
        updated.push(next);
        return next;
      });
      if (updated.length > 0) writeLocal(key, rows);
      return updated;
    },
  };
}

const hubs = table<SmartHub>(SMART_HUB_STORAGE_KEYS.hubs);
const pages = table<SmartHubPage>(SMART_HUB_STORAGE_KEYS.pages);
const buttons = table<SmartHubButton>(SMART_HUB_STORAGE_KEYS.buttons);
const themes = table<SmartHubTheme>(SMART_HUB_STORAGE_KEYS.themes);
const assets = table<SmartHubAsset>(SMART_HUB_STORAGE_KEYS.assets);
const domains = table<SmartHubDomain>(SMART_HUB_STORAGE_KEYS.domains);
const visits = table<SmartHubVisit>(SMART_HUB_STORAGE_KEYS.visits);
const clicks = table<SmartHubClick>(SMART_HUB_STORAGE_KEYS.clicks);
const events = table<SmartHubEvent>(SMART_HUB_STORAGE_KEYS.events);

function paginate<T>(rows: T[], params: { page?: number; pageSize?: number }, defaultSize = 50): PaginatedResult<T> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? defaultSize;
  const from = (page - 1) * pageSize;
  return { data: rows.slice(from, from + pageSize), total: rows.length, page, pageSize };
}

function sortBy<T>(rows: T[], field: string, ascending: boolean): T[] {
  return [...rows].sort((a, b) => {
    const av = (a as Record<string, unknown>)[field];
    const bv = (b as Record<string, unknown>)[field];
    const cmp =
      typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av ?? '').localeCompare(String(bv ?? ''));
    return ascending ? cmp : -cmp;
  });
}

function matchesSearch(search: string | undefined, ...values: Array<string | null | undefined>): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return values.some((v) => v?.toLowerCase().includes(term));
}

function requireOne<T>(rows: T[], message: string): T {
  if (rows.length === 0) throw new Error(message);
  return rows[0];
}

function byButtonOrder(a: SmartHubButton, b: SmartHubButton): number {
  return a.order_index - b.order_index || a.created_at.localeCompare(b.created_at);
}

function getHub(hubId: string): SmartHub | null {
  return hubs.active((h) => h.id === hubId)[0] ?? null;
}

function buildHubPayload(hub: SmartHub, preview: boolean): PublicSmartHubPayload {
  const visibleButtons = buttons
    .active((b) => b.hub_id === hub.id && b.visible && b.status === 'active')
    .sort(byButtonOrder);
  const homePage =
    pages
      .active((p) => p.hub_id === hub.id && p.is_home)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null;

  return {
    hub,
    theme: themes.active((t) => t.hub_id === hub.id)[0] ?? null,
    buttons: visibleButtons,
    page: homePage,
    assets: assets
      .active((a) => a.hub_id === hub.id && a.status === 'active')
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    ...(preview ? { preview: true } : {}),
  };
}

function isSlugTaken(slug: string, excludeHubId?: string | null): boolean {
  return hubs.active((h) => h.slug === slug && h.id !== excludeHubId).length > 0;
}

function validateHub(hub: SmartHub) {
  const errors: SmartHubValidationIssue[] = [];
  const warnings: SmartHubValidationIssue[] = [];

  if (!hub.title?.trim()) {
    errors.push({ code: 'title_required', message: 'Informe o nome público do hub.' });
  }
  const slug = normalizeSlug(hub.slug || '');
  if (!slug) {
    errors.push({ code: 'slug_required', message: 'Informe um slug válido.' });
  } else if (isSlugTaken(slug, hub.id)) {
    errors.push({ code: 'slug_unavailable', message: 'Slug indisponível ou inválido.' });
  }
  if (!hub.template_id) {
    errors.push({ code: 'template_required', message: 'Escolha e aplique um template.' });
  }

  const visibleButtons = buttons.active(
    (b) => b.hub_id === hub.id && b.visible && b.status === 'active'
  ).length;
  if (visibleButtons === 0 && !hub.whatsapp_number?.trim()) {
    errors.push({
      code: 'conversion_required',
      message: 'Adicione pelo menos um botão visível (ou informe um WhatsApp nas configurações).',
    });
  }
  if (!hub.seo_title?.trim()) {
    warnings.push({ code: 'seo_title_missing', message: 'SEO title recomendado para melhor indexação.' });
  }
  if (!hub.logo_url?.trim()) {
    warnings.push({
      code: 'logo_missing',
      message: 'Logo recomendado para reforçar a identidade da clínica.',
    });
  }

  hubs.patch((h) => h.id === hub.id, {
    validation_errors: errors,
    last_validated_at: nowIso(),
    updated_at: nowIso(),
  });

  return { ok: errors.length === 0, errors, warnings, visible_buttons: visibleButtons };
}

/** Hub publicado pelo slug — mesma regra da página pública. */
export function findPublishedHubBySlug(slug: string): SmartHub | null {
  const normalized = normalizeSlug(slug || '');
  if (!normalized) return null;
  return hubs.active((h) => h.slug === normalized && h.status === 'published')[0] ?? null;
}

export function findHubBySlug(slug: string): SmartHub | null {
  const normalized = normalizeSlug(slug || '');
  if (!normalized) return null;
  return hubs.active((h) => h.slug === normalized)[0] ?? null;
}

export function recordLocalEvent(
  hub: SmartHub,
  eventType: string,
  eventName: string | null,
  payload: Record<string, unknown> = {}
) {
  const now = nowIso();
  events.insert({
    id: createLocalId(),
    clinic_id: hub.clinic_id,
    hub_id: hub.id,
    event_type: eventType,
    event_name: eventName,
    payload,
    visit_id: null,
    status: 'active',
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
}

export const localHubRepository = {
  async getByClinicId(clinicId: string): Promise<SmartHub | null> {
    return hubs.active((h) => h.clinic_id === clinicId)[0] ?? null;
  },

  async getById(id: string, clinicId: string): Promise<SmartHub | null> {
    return hubs.active((h) => h.id === id && h.clinic_id === clinicId)[0] ?? null;
  },

  async list(params: ListQueryParams): Promise<PaginatedResult<SmartHub>> {
    const rows = hubs.active(
      (h) =>
        h.clinic_id === params.clinicId &&
        (!params.status || h.status === params.status) &&
        matchesSearch(params.search, h.title, h.slug, h.subtitle)
    );
    return paginate(
      sortBy(rows, params.orderBy ?? 'updated_at', params.ascending ?? false),
      params,
      20
    );
  },

  async create(payload: SmartHubInsert): Promise<SmartHub> {
    if (hubs.active((h) => h.clinic_id === payload.clinic_id).length > 0) {
      throw new Error('Esta clínica já possui um Smart Hub.');
    }
    const slug = normalizeSlug(payload.slug);
    if (isSlugTaken(slug)) throw new Error('Este slug já está em uso. Escolha outro.');
    const now = nowIso();
    return hubs.insert({
      id: createLocalId(),
      subtitle: null,
      description: null,
      logo_url: null,
      banner_url: null,
      background_url: null,
      profile_url: null,
      theme: 'default',
      primary_color: '#0F766E',
      secondary_color: '#134E4A',
      font_family: 'Inter',
      seo_title: null,
      seo_description: null,
      favicon_url: null,
      status: 'draft',
      template_id: null,
      published_at: null,
      paused_at: null,
      last_validated_at: null,
      validation_errors: [],
      whatsapp_number: null,
      contact_phone: null,
      contact_email: null,
      contact_address: null,
      map_embed_url: null,
      layout_blocks: DEFAULT_BLOCKS,
      style_preset: 'clean',
      visual_config: {},
      capture_config: {},
      public_booking_enabled: false,
      created_at: now,
      updated_at: now,
      created_by: null,
      updated_by: null,
      deleted_at: null,
      ...definedOnly(payload),
      slug,
    } as SmartHub);
  },

  async update(id: string, clinicId: string, payload: SmartHubUpdate): Promise<SmartHub> {
    const changes = definedOnly(payload);
    if (changes.slug) {
      changes.slug = normalizeSlug(changes.slug);
      if (isSlugTaken(changes.slug, id)) throw new Error('Este slug já está em uso. Escolha outro.');
    }
    return requireOne(
      hubs.patch((h) => h.id === id && h.clinic_id === clinicId, { ...changes, updated_at: nowIso() }),
      'Hub não encontrado.'
    );
  },

  async softDelete(id: string, clinicId: string, userId?: string | null): Promise<void> {
    hubs.patch((h) => h.id === id && h.clinic_id === clinicId, {
      deleted_at: nowIso(),
      updated_by: userId ?? null,
      status: 'archived',
    });
  },

  async isSlugAvailable(slug: string, excludeHubId?: string | null): Promise<boolean> {
    const normalized = normalizeSlug(slug || '');
    return Boolean(normalized) && !isSlugTaken(normalized, excludeHubId);
  },

  async getPublicBySlug(slug: string): Promise<PublicSmartHubPayload | null> {
    const hub = findPublishedHubBySlug(slug);
    return hub ? buildHubPayload(hub, false) : null;
  },

  async getPreviewById(hubId: string): Promise<PublicSmartHubPayload | null> {
    const hub = getHub(hubId);
    return hub ? buildHubPayload(hub, true) : null;
  },

  async validateForPublish(hubId: string): Promise<unknown> {
    const hub = getHub(hubId);
    if (!hub) {
      return {
        ok: false,
        errors: [{ code: 'hub_not_found', message: 'Hub não encontrado.' }],
        warnings: [],
        visible_buttons: 0,
      };
    }
    return validateHub(hub);
  },

  async publish(hubId: string): Promise<unknown> {
    const hub = getHub(hubId);
    if (!hub) throw new Error('Hub não encontrado');
    const validation = validateHub(hub);
    if (!validation.ok) {
      return { ok: false, status: hub.status, validation };
    }
    const now = nowIso();
    hubs.patch((h) => h.id === hubId, {
      status: 'published',
      published_at: now,
      paused_at: null,
      updated_at: now,
    });
    pages.patch((p) => p.hub_id === hubId && p.is_home, { status: 'published', updated_at: now });
    return { ok: true, status: 'published', validation };
  },

  async pause(hubId: string): Promise<unknown> {
    const hub = getHub(hubId);
    if (!hub) throw new Error('Hub não encontrado');
    if (hub.status !== 'published' && hub.status !== 'offline') {
      throw new Error('Somente hubs publicados podem ser pausados');
    }
    const now = nowIso();
    hubs.patch((h) => h.id === hubId, { status: 'offline', paused_at: now, updated_at: now });
    return { ok: true, status: 'offline' };
  },

  async revertToDraft(hubId: string): Promise<unknown> {
    const hub = getHub(hubId);
    if (!hub) throw new Error('Hub não encontrado');
    const now = nowIso();
    hubs.patch((h) => h.id === hubId, {
      status: 'draft',
      paused_at: hub.status === 'published' ? now : hub.paused_at,
      updated_at: now,
    });
    pages.patch((p) => p.hub_id === hubId && p.is_home, { status: 'draft', updated_at: now });
    return { ok: true, status: 'draft' };
  },

  async applyTemplate(hubId: string, templateId: string): Promise<unknown> {
    const hub = getHub(hubId);
    if (!hub) throw new Error('Hub não encontrado');
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) throw new Error('Template não encontrado');

    const layoutBlocks = tpl.json_layout.blocks;
    const blocks = Array.isArray(layoutBlocks) ? (layoutBlocks as string[]) : DEFAULT_BLOCKS;
    const now = nowIso();
    hubs.patch((h) => h.id === hubId, {
      template_id: tpl.id,
      layout_blocks: blocks,
      theme: hub.theme?.trim() || 'default',
      updated_at: now,
    });
    pages.patch((p) => p.hub_id === hubId && p.is_home, {
      layout_json: { version: 1, blocks, template_id: tpl.id },
      updated_at: now,
    });
    return { ok: true, template_id: tpl.id, layout_blocks: blocks };
  },
};

export const localButtonRepository = {
  async listByHub(
    hubId: string,
    clinicId: string,
    params: Omit<ListQueryParams, 'clinicId'> = {}
  ): Promise<PaginatedResult<SmartHubButton>> {
    const rows = buttons.active(
      (b) =>
        b.hub_id === hubId &&
        b.clinic_id === clinicId &&
        (!params.status || b.status === params.status) &&
        matchesSearch(params.search, b.title, b.subtitle)
    );
    const sorted = params.orderBy
      ? sortBy(rows, params.orderBy, params.ascending ?? true)
      : rows.sort(byButtonOrder);
    return paginate(sorted, params);
  },

  async create(payload: SmartHubButtonInsert): Promise<SmartHubButton> {
    const now = nowIso();
    return buttons.insert({
      id: createLocalId(),
      subtitle: null,
      icon: null,
      type: 'link',
      url: null,
      image: null,
      image_alt: null,
      visual_variant: 'simple',
      image_position: 'left',
      whatsapp_message: null,
      click_action: 'auto',
      capture_config: {},
      background_color: null,
      text_color: null,
      visible: true,
      order_index: 0,
      track_click: true,
      status: 'active',
      created_at: now,
      updated_at: now,
      created_by: null,
      updated_by: null,
      deleted_at: null,
      ...definedOnly(payload),
    } as SmartHubButton);
  },

  async update(id: string, clinicId: string, payload: SmartHubButtonUpdate): Promise<SmartHubButton> {
    return requireOne(
      buttons.patch((b) => b.id === id && b.clinic_id === clinicId, {
        ...definedOnly(payload),
        updated_at: nowIso(),
      }),
      'Botão não encontrado.'
    );
  },

  async softDelete(id: string, clinicId: string, userId?: string | null): Promise<void> {
    buttons.patch((b) => b.id === id && b.clinic_id === clinicId, {
      deleted_at: nowIso(),
      updated_by: userId ?? null,
      status: 'archived',
    });
  },

  async reorder(clinicId: string, items: { id: string; order_index: number }[]): Promise<void> {
    const order = new Map(items.map((item) => [item.id, item.order_index]));
    buttons.replaceAll(
      buttons.all().map((b) =>
        b.clinic_id === clinicId && !b.deleted_at && order.has(b.id)
          ? { ...b, order_index: order.get(b.id)!, updated_at: nowIso() }
          : b
      )
    );
  },
};

export const localThemeRepository = {
  async getByHubId(hubId: string, clinicId: string): Promise<SmartHubTheme | null> {
    return themes.active((t) => t.hub_id === hubId && t.clinic_id === clinicId)[0] ?? null;
  },

  async upsert(
    clinicId: string,
    hubId: string,
    payload: Partial<SmartHubTheme>,
    userId?: string | null
  ): Promise<SmartHubTheme> {
    const now = nowIso();
    const updated = themes.patch((t) => t.hub_id === hubId && t.clinic_id === clinicId, {
      ...definedOnly(payload),
      updated_by: userId ?? null,
      updated_at: now,
    });
    if (updated.length > 0) return updated[0];

    return themes.insert({
      id: createLocalId(),
      theme_name: 'default',
      primary_color: '#0F766E',
      secondary_color: '#134E4A',
      accent_color: null,
      background_color: null,
      text_color: null,
      button_radius: 'lg',
      font_family: 'Inter',
      custom_css: null,
      config_json: {},
      status: 'active',
      created_at: now,
      updated_at: now,
      deleted_at: null,
      ...definedOnly(payload),
      clinic_id: clinicId,
      hub_id: hubId,
      created_by: userId ?? null,
      updated_by: userId ?? null,
    });
  },
};

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

function storageFolder(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

export const localAssetRepository = {
  async listByHub(
    hubId: string,
    clinicId: string,
    params: Omit<ListQueryParams, 'clinicId'> = {}
  ): Promise<PaginatedResult<SmartHubAsset>> {
    const rows = assets.active(
      (a) => a.hub_id === hubId && a.clinic_id === clinicId && matchesSearch(params.search, a.file_name)
    );
    return paginate(sortBy(rows, params.orderBy ?? 'created_at', params.ascending ?? false), params);
  },

  async create(
    payload: Partial<SmartHubAsset> & {
      clinic_id: string;
      hub_id: string;
      file_name: string;
      storage_path: string;
    }
  ): Promise<SmartHubAsset> {
    // As imagens ficam embutidas no navegador: mantém só a versão mais recente de cada pasta
    // (logo, banner, perfil, imagem de cada botão) para não estourar o limite do localStorage.
    const folder = storageFolder(payload.storage_path);
    assets.replaceAll(assets.all().filter((a) => storageFolder(a.storage_path) !== folder));

    const now = nowIso();
    return assets.insert({
      id: createLocalId(),
      file_type: null,
      public_url: null,
      asset_kind: 'other',
      status: 'active',
      created_at: now,
      updated_at: now,
      created_by: null,
      updated_by: null,
      deleted_at: null,
      ...definedOnly(payload),
    } as SmartHubAsset);
  },

  async softDelete(id: string, clinicId: string, userId?: string | null): Promise<void> {
    assets.patch((a) => a.id === id && a.clinic_id === clinicId, {
      deleted_at: nowIso(),
      updated_by: userId ?? null,
      status: 'archived',
    });
  },

  async removeStoragePath(_storagePath: string | null | undefined): Promise<void> {
    // Sem storage externo: a imagem anterior é descartada em create().
  },

  async uploadFile(
    clinicId: string,
    hubId: string,
    file: File,
    kind: SmartHubAssetKind = 'other',
    buttonId?: string | null
  ): Promise<{ storage_path: string; public_url: string; file_name: string; file_type: string }> {
    const check = validateSmartHubImage(file, kind);
    if (check.ok === false) throw new Error(check.message);

    const prepared = await compressImageToWebp(file, {
      maxWidth: kind === 'banner' || kind === 'background' ? 1400 : 800,
      quality: 0.8,
    });

    const folder =
      kind === 'button' && buttonId
        ? `local/${clinicId}/${hubId}/buttons/${buttonId}`
        : `local/${clinicId}/${hubId}/${kind}`;

    return {
      storage_path: `${folder}/${Date.now()}-${normalizeAssetFileName(prepared.name)}`,
      public_url: await readAsDataUrl(prepared),
      file_name: prepared.name,
      file_type: prepared.type || 'image/webp',
    };
  },
};

export const localTemplateRepository = {
  async list(): Promise<SmartHubTemplate[]> {
    return TEMPLATES;
  },
};

export const localDomainRepository = {
  async listByHub(hubId: string, clinicId: string): Promise<SmartHubDomain[]> {
    return domains
      .active((d) => d.hub_id === hubId && d.clinic_id === clinicId)
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || b.created_at.localeCompare(a.created_at));
  },

  async create(
    payload: Partial<SmartHubDomain> & { clinic_id: string; hub_id: string; domain: string }
  ): Promise<SmartHubDomain> {
    const domain = payload.domain.trim().toLowerCase();
    if (domains.active((d) => d.domain === domain).length > 0) {
      throw new Error('Este domínio já está cadastrado.');
    }
    const now = nowIso();
    return domains.insert({
      id: createLocalId(),
      is_primary: false,
      is_verified: false,
      verification_token: null,
      ssl_status: 'pending',
      status: 'pending',
      created_at: now,
      updated_at: now,
      created_by: null,
      updated_by: null,
      deleted_at: null,
      ...definedOnly(payload),
      domain,
    } as SmartHubDomain);
  },

  async softDelete(id: string, clinicId: string, userId?: string | null): Promise<void> {
    domains.patch((d) => d.id === id && d.clinic_id === clinicId, {
      deleted_at: nowIso(),
      updated_by: userId ?? null,
      status: 'inactive',
    });
  },
};

export const localPageRepository = {
  async listByHub(hubId: string, clinicId: string): Promise<SmartHubPage[]> {
    return pages
      .active((p) => p.hub_id === hubId && p.clinic_id === clinicId)
      .sort((a, b) => Number(b.is_home) - Number(a.is_home) || a.created_at.localeCompare(b.created_at));
  },

  async create(
    payload: Partial<SmartHubPage> & { clinic_id: string; hub_id: string; title: string }
  ): Promise<SmartHubPage> {
    const now = nowIso();
    const slug = payload.slug ?? 'home';
    if (pages.active((p) => p.hub_id === payload.hub_id && p.slug === slug).length > 0) {
      throw new Error('Já existe uma página com este endereço.');
    }
    return pages.insert({
      id: createLocalId(),
      layout_json: { version: 1, blocks: [] },
      is_home: true,
      status: 'draft',
      created_at: now,
      updated_at: now,
      created_by: null,
      updated_by: null,
      deleted_at: null,
      ...definedOnly(payload),
      slug,
    } as SmartHubPage);
  },

  async update(id: string, clinicId: string, payload: Partial<SmartHubPage>): Promise<SmartHubPage> {
    return requireOne(
      pages.patch((p) => p.id === id && p.clinic_id === clinicId, {
        ...definedOnly(payload),
        updated_at: nowIso(),
      }),
      'Página não encontrada.'
    );
  },
};

function mode(values: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (v) counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best: string | null = null;
  let max = 0;
  for (const [value, count] of counts) {
    if (count > max) {
      max = count;
      best = value;
    }
  }
  return best;
}

function stringField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value ? value : null;
}

export const localAnalyticsRepository = {
  async listVisits(
    hubId: string,
    clinicId: string,
    params: Omit<ListQueryParams, 'clinicId'> = {}
  ): Promise<PaginatedResult<SmartHubVisit>> {
    const rows = visits.active((v) => v.hub_id === hubId && v.clinic_id === clinicId);
    return paginate(sortBy(rows, params.orderBy ?? 'created_at', params.ascending ?? false), params);
  },

  async listClicks(
    hubId: string,
    clinicId: string,
    params: Omit<ListQueryParams, 'clinicId'> = {}
  ): Promise<PaginatedResult<SmartHubClick>> {
    const rows = clicks.active((c) => c.hub_id === hubId && c.clinic_id === clinicId);
    return paginate(sortBy(rows, params.orderBy ?? 'created_at', params.ascending ?? false), params);
  },

  async listEvents(
    hubId: string,
    clinicId: string,
    params: Omit<ListQueryParams, 'clinicId'> = {}
  ): Promise<PaginatedResult<SmartHubEvent>> {
    const rows = events.active(
      (e) =>
        e.hub_id === hubId &&
        e.clinic_id === clinicId &&
        matchesSearch(params.search, e.event_type, e.event_name)
    );
    return paginate(sortBy(rows, params.orderBy ?? 'created_at', params.ascending ?? false), params);
  },

  async getDashboardMetrics(
    hubId: string,
    clinicId: string,
    status: SmartHubStatus,
    publicUrl: string
  ): Promise<SmartHubDashboardMetrics> {
    const visitRows = visits
      .active((v) => v.hub_id === hubId && v.clinic_id === clinicId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const allClickRows = clicks.active((c) => c.hub_id === hubId && c.clinic_id === clinicId);
    // Etapas do assistente de agendamento também são gravadas como cliques (booking:*);
    // apenas booking_started corresponde a um clique real no botão.
    const clickRows = allClickRows.filter(
      (c) => !c.target_url?.startsWith('booking:') || c.target_url === 'booking:booking_started'
    );
    const buttonTitles = new Map(
      buttons.active((b) => b.hub_id === hubId).map((b) => [b.id, b.title] as const)
    );
    const eventRows = events.active((e) => e.hub_id === hubId && e.clinic_id === clinicId);

    const views = visitRows.length;
    const clickCount = clickRows.length;
    const ctr = views > 0 ? Number(((clickCount / views) * 100).toFixed(2)) : 0;

    const formsSubmitted = eventRows.filter((e) => e.event_type === 'form_submitted').length;
    const formsDuplicate = eventRows.filter((e) => e.event_type === 'form_duplicate').length;
    const formsOpened = clickRows.filter((c) => c.target_url === 'form:open').length;
    const appointments = eventRows.filter((e) => e.event_type === 'booking_confirmed').length;
    const conversions = formsSubmitted + formsDuplicate + appointments;

    const whatsappClicks = clickRows.filter(
      (c) =>
        c.metadata?.click_action === 'whatsapp' ||
        c.metadata?.button_type === 'whatsapp' ||
        (c.target_url && /wa\.me|whatsapp/i.test(c.target_url))
    ).length;

    const topButton = mode(
      clickRows.map((c) => {
        const title = c.metadata?.button_title;
        if (typeof title === 'string' && title) return title;
        if (c.button_id && buttonTitles.has(c.button_id)) return buttonTitles.get(c.button_id);
        return c.target_url === 'booking:booking_started' ? 'Agendamento online' : c.target_url;
      })
    );

    return {
      publicUrl,
      status,
      online: status === 'published',
      views,
      clicks: clickCount,
      leads: formsSubmitted,
      appointments,
      conversions,
      ctr,
      topButton,
      mainOrigin: mode(visitRows.map((v) => v.utm_source || v.referrer || 'Direto')),
      mainDevice: mode(visitRows.map((v) => v.device_type)),
      mainCampaign: mode(visitRows.map((v) => v.utm_campaign)),
      lastVisitAt: visitRows[0]?.created_at ?? null,
      whatsappClicks,
      formsOpened,
      formsSubmitted,
      leadsUpdated: formsDuplicate,
      submitRate: formsOpened > 0 ? Number(((formsSubmitted / formsOpened) * 100).toFixed(1)) : 0,
      conversionRate: views > 0 ? Number(((conversions / views) * 100).toFixed(1)) : 0,
    };
  },

  async trackVisit(hubId: string, payload: Record<string, unknown> = {}): Promise<string> {
    const hub = getHub(hubId);
    if (!hub || hub.status !== 'published') throw new Error('Hub não encontrado ou offline');
    const now = nowIso();
    return visits.insert({
      id: createLocalId(),
      clinic_id: hub.clinic_id,
      hub_id: hubId,
      visitor_id: stringField(payload, 'visitor_id'),
      session_id: stringField(payload, 'session_id'),
      referrer: stringField(payload, 'referrer'),
      utm_source: stringField(payload, 'utm_source'),
      utm_medium: stringField(payload, 'utm_medium'),
      utm_campaign: stringField(payload, 'utm_campaign'),
      device_type: stringField(payload, 'device_type'),
      browser: stringField(payload, 'browser'),
      os: stringField(payload, 'os'),
      country: null,
      city: null,
      ip_hash: null,
      user_agent: stringField(payload, 'user_agent'),
      status: 'active',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }).id;
  },

  async trackClick(
    hubId: string,
    buttonId: string | null,
    payload: Record<string, unknown> = {}
  ): Promise<string> {
    const hub = getHub(hubId);
    if (!hub || hub.status !== 'published') throw new Error('Hub não encontrado ou offline');
    const now = nowIso();
    return clicks.insert({
      id: createLocalId(),
      clinic_id: hub.clinic_id,
      hub_id: hubId,
      button_id: buttonId,
      visit_id: stringField(payload, 'visit_id'),
      target_url: stringField(payload, 'target_url'),
      device_type: stringField(payload, 'device_type'),
      referrer: stringField(payload, 'referrer'),
      utm_campaign: stringField(payload, 'utm_campaign'),
      metadata: payload,
      status: 'active',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }).id;
  },
};

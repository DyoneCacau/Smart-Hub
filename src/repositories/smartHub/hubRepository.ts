import { supabase } from '@/integrations/supabase/client';
import type {
  ListQueryParams,
  PaginatedResult,
  PublicSmartHubPayload,
  SmartHub,
  SmartHubInsert,
  SmartHubLayoutBlock,
  SmartHubUpdate,
} from '@/types/smartHub';
import { paginateRange } from './base';

const TABLE = 'smart_hubs';
const DEFAULT_BLOCKS: SmartHubLayoutBlock[] = [
  'header',
  'logo',
  'description',
  'buttons',
  'footer',
];

function normalizeHub(raw: SmartHub | null): SmartHub | null {
  if (!raw) return null;
  const layoutBlocks = Array.isArray(raw.layout_blocks)
    ? raw.layout_blocks
    : DEFAULT_BLOCKS;
  const visualConfig =
    raw.visual_config && typeof raw.visual_config === 'object' && !Array.isArray(raw.visual_config)
      ? raw.visual_config
      : {};
  return {
    ...raw,
    layout_blocks: layoutBlocks,
    validation_errors: Array.isArray(raw.validation_errors) ? raw.validation_errors : [],
    template_id: raw.template_id ?? null,
    published_at: raw.published_at ?? null,
    paused_at: raw.paused_at ?? null,
    last_validated_at: raw.last_validated_at ?? null,
    whatsapp_number: raw.whatsapp_number ?? null,
    contact_phone: raw.contact_phone ?? null,
    contact_email: raw.contact_email ?? null,
    contact_address: raw.contact_address ?? null,
    map_embed_url: raw.map_embed_url ?? null,
    profile_url: raw.profile_url ?? null,
    style_preset: raw.style_preset || 'clean',
    visual_config: visualConfig,
    capture_config:
      raw.capture_config && typeof raw.capture_config === 'object' && !Array.isArray(raw.capture_config)
        ? (raw.capture_config as SmartHub['capture_config'])
        : {},
  };
}

export const hubRepository = {
  async getByClinicId(clinicId: string): Promise<SmartHub | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    return normalizeHub(data as SmartHub | null);
  },

  async getById(id: string, clinicId: string): Promise<SmartHub | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    return normalizeHub(data as SmartHub | null);
  },

  async list(params: ListQueryParams): Promise<PaginatedResult<SmartHub>> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const { from, to } = paginateRange(page, pageSize);

    let query = supabase
      .from(TABLE)
      .select('*', { count: 'exact' })
      .eq('clinic_id', params.clinicId)
      .is('deleted_at', null);

    if (params.search) {
      query = query.or(
        `title.ilike.%${params.search}%,slug.ilike.%${params.search}%,subtitle.ilike.%${params.search}%`
      );
    }
    if (params.status) {
      query = query.eq('status', params.status);
    }

    query = query
      .order(params.orderBy ?? 'updated_at', { ascending: params.ascending ?? false })
      .range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: ((data || []) as SmartHub[]).map((row) => normalizeHub(row)!),
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async create(payload: SmartHubInsert): Promise<SmartHub> {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload as never)
      .select('*')
      .single();

    if (error) throw error;
    return normalizeHub(data as SmartHub)!;
  },

  async update(id: string, clinicId: string, payload: SmartHubUpdate): Promise<SmartHub> {
    const { data, error } = await supabase
      .from(TABLE)
      .update(payload as never)
      .eq('id', id)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error) throw error;
    return normalizeHub(data as SmartHub)!;
  },

  async softDelete(id: string, clinicId: string, userId?: string | null): Promise<void> {
    const { error } = await supabase
      .from(TABLE)
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: userId ?? null,
        status: 'archived',
      } as never)
      .eq('id', id)
      .eq('clinic_id', clinicId);

    if (error) throw error;
  },

  async isSlugAvailable(slug: string, excludeHubId?: string | null): Promise<boolean> {
    const { data, error } = await supabase.rpc('is_smart_hub_slug_available' as never, {
      p_slug: slug,
      p_exclude_hub_id: excludeHubId ?? null,
    } as never);

    if (error) throw error;
    return Boolean(data);
  },

  async getPublicBySlug(slug: string): Promise<PublicSmartHubPayload | null> {
    const { data, error } = await supabase.rpc('get_public_smart_hub' as never, {
      p_slug: slug,
    } as never);

    if (error) throw error;
    if (!data) return null;
    return normalizePublicPayload(data);
  },

  async getPreviewById(hubId: string): Promise<PublicSmartHubPayload | null> {
    const { data, error } = await supabase.rpc('get_preview_smart_hub' as never, {
      p_hub_id: hubId,
    } as never);

    if (error) {
      if (import.meta.env.DEV) {
        console.debug('[smart-hub preview] RPC error', error);
      }
      throw error;
    }
    if (!data) return null;
    const payload = normalizePublicPayload(data);
    if (import.meta.env.DEV) {
      console.debug('[smart-hub preview] RPC ok', {
        buttons: payload.buttons.length,
        status: payload.hub?.status,
        layout_blocks: payload.hub?.layout_blocks,
      });
    }
    return payload;
  },

  async validateForPublish(hubId: string): Promise<unknown> {
    const { data, error } = await supabase.rpc('validate_smart_hub_for_publish' as never, {
      p_hub_id: hubId,
    } as never);
    if (error) {
      if (import.meta.env.DEV) {
        console.debug('[smart-hub validate] RPC error', error);
      }
      throw error;
    }
    if (import.meta.env.DEV) {
      console.debug('[smart-hub validate] RPC result', data);
    }
    return data;
  },

  async publish(hubId: string): Promise<unknown> {
    const { data, error } = await supabase.rpc('publish_smart_hub' as never, {
      p_hub_id: hubId,
    } as never);
    if (error) throw error;
    return data;
  },

  async pause(hubId: string): Promise<unknown> {
    const { data, error } = await supabase.rpc('pause_smart_hub' as never, {
      p_hub_id: hubId,
    } as never);
    if (error) throw error;
    return data;
  },

  async revertToDraft(hubId: string): Promise<unknown> {
    const { data, error } = await supabase.rpc('unpublish_smart_hub_to_draft' as never, {
      p_hub_id: hubId,
    } as never);
    if (error) throw error;
    return data;
  },

  async applyTemplate(hubId: string, templateId: string): Promise<unknown> {
    const { data, error } = await supabase.rpc('apply_smart_hub_template' as never, {
      p_hub_id: hubId,
      p_template_id: templateId,
    } as never);
    if (error) throw error;
    return data;
  },
};

function normalizePublicPayload(raw: unknown): PublicSmartHubPayload {
  const data = raw as PublicSmartHubPayload;
  const hub = data.hub;
  const layoutBlocks = Array.isArray(hub?.layout_blocks)
    ? hub.layout_blocks
    : typeof hub?.layout_blocks === 'string'
      ? (() => {
          try {
            return JSON.parse(hub.layout_blocks as unknown as string);
          } catch {
            return ['header', 'logo', 'description', 'buttons', 'footer'];
          }
        })()
      : ['header', 'logo', 'description', 'buttons', 'footer'];

  return {
    ...data,
    hub: {
      ...hub,
      layout_blocks: layoutBlocks,
      validation_errors: Array.isArray(hub?.validation_errors) ? hub.validation_errors : [],
      template_id: hub?.template_id ?? null,
      published_at: hub?.published_at ?? null,
      paused_at: hub?.paused_at ?? null,
      last_validated_at: hub?.last_validated_at ?? null,
      whatsapp_number: hub?.whatsapp_number ?? null,
      contact_phone: hub?.contact_phone ?? null,
      contact_email: hub?.contact_email ?? null,
      contact_address: hub?.contact_address ?? null,
      profile_url: hub?.profile_url ?? null,
      map_embed_url: hub?.map_embed_url ?? null,
      style_preset: hub?.style_preset || 'clean',
      visual_config:
        hub?.visual_config && typeof hub.visual_config === 'object' && !Array.isArray(hub.visual_config)
          ? hub.visual_config
          : {},
      capture_config:
        hub?.capture_config && typeof hub.capture_config === 'object' && !Array.isArray(hub.capture_config)
          ? hub.capture_config
          : {},
      public_booking_enabled: hub?.public_booking_enabled === true,
    },
    buttons: Array.isArray(data.buttons)
      ? data.buttons.map((b) => ({
          ...b,
          image_alt: b.image_alt ?? null,
          visual_variant: b.visual_variant || 'simple',
          image_position: b.image_position || 'left',
          whatsapp_message: b.whatsapp_message ?? null,
          click_action: b.click_action || 'auto',
          capture_config:
            b.capture_config && typeof b.capture_config === 'object' && !Array.isArray(b.capture_config)
              ? b.capture_config
              : {},
        }))
      : [],
    assets: Array.isArray(data.assets) ? data.assets : [],
  };
}

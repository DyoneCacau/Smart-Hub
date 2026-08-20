import { supabase } from '@/integrations/supabase/client';
import type {
  ListQueryParams,
  PaginatedResult,
  SmartHubButton,
  SmartHubButtonInsert,
  SmartHubButtonUpdate,
} from '@/types/smartHub';
import { paginateRange } from './base';

const TABLE = 'smart_hub_buttons';

export const buttonRepository = {
  async listByHub(
    hubId: string,
    clinicId: string,
    params: Omit<ListQueryParams, 'clinicId'> = {}
  ): Promise<PaginatedResult<SmartHubButton>> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 50;
    const { from, to } = paginateRange(page, pageSize);

    let query = supabase
      .from(TABLE)
      .select('*', { count: 'exact' })
      .eq('hub_id', hubId)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null);

    if (params.search) {
      query = query.or(`title.ilike.%${params.search}%,subtitle.ilike.%${params.search}%`);
    }
    if (params.status) {
      query = query.eq('status', params.status);
    }

    query = query
      .order(params.orderBy ?? 'order_index', { ascending: params.ascending ?? true })
      .range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: (data || []) as SmartHubButton[],
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async create(payload: SmartHubButtonInsert): Promise<SmartHubButton> {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload as never)
      .select('*')
      .single();

    if (error) throw error;
    return data as SmartHubButton;
  },

  async update(
    id: string,
    clinicId: string,
    payload: SmartHubButtonUpdate
  ): Promise<SmartHubButton> {
    const { data, error } = await supabase
      .from(TABLE)
      .update(payload as never)
      .eq('id', id)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error) throw error;
    return data as SmartHubButton;
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

  async reorder(
    clinicId: string,
    items: { id: string; order_index: number }[]
  ): Promise<void> {
    for (const item of items) {
      const { error } = await supabase
        .from(TABLE)
        .update({ order_index: item.order_index } as never)
        .eq('id', item.id)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null);
      if (error) throw error;
    }
  },
};

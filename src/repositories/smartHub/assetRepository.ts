import { supabase } from '@/integrations/supabase/client';
import type {
  SmartHubAsset,
  SmartHubAssetKind,
  ListQueryParams,
  PaginatedResult,
} from '@/types/smartHub';
import { paginateRange } from './base';
import {
  compressImageToWebp,
  normalizeAssetFileName,
  validateSmartHubImage,
} from '@/services/smartHub/imageUtils';

const TABLE = 'smart_hub_assets';
const BUCKET = 'smart-hub-assets';

export const assetRepository = {
  async listByHub(
    hubId: string,
    clinicId: string,
    params: Omit<ListQueryParams, 'clinicId'> = {}
  ): Promise<PaginatedResult<SmartHubAsset>> {
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
      query = query.ilike('file_name', `%${params.search}%`);
    }

    query = query
      .order(params.orderBy ?? 'created_at', { ascending: params.ascending ?? false })
      .range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: (data || []) as SmartHubAsset[],
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async create(
    payload: Partial<SmartHubAsset> & {
      clinic_id: string;
      hub_id: string;
      file_name: string;
      storage_path: string;
    }
  ): Promise<SmartHubAsset> {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload as never)
      .select('*')
      .single();

    if (error) throw error;
    return data as SmartHubAsset;
  },

  async softDelete(id: string, clinicId: string, userId?: string | null): Promise<void> {
    const { data: row } = await supabase
      .from(TABLE)
      .select('storage_path')
      .eq('id', id)
      .eq('clinic_id', clinicId)
      .maybeSingle();

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

    const path = (row as { storage_path?: string } | null)?.storage_path;
    if (path) {
      await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
    }
  },

  async removeStoragePath(storagePath: string | null | undefined): Promise<void> {
    if (!storagePath) return;
    // Só remove se estiver no bucket do Smart Hub e path tiver clinic_id
    if (!storagePath.includes('/')) return;
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => undefined);
  },

  /**
   * Upload: {clinic_id}/{hub_id}/{kind}/[buttonId/]{timestamp}-{name}
   */
  async uploadFile(
    clinicId: string,
    hubId: string,
    file: File,
    kind: SmartHubAssetKind = 'other',
    buttonId?: string | null
  ): Promise<{
    storage_path: string;
    public_url: string;
    file_name: string;
    file_type: string;
  }> {
    const check = validateSmartHubImage(file, kind);
    if (check.ok === false) throw new Error(check.message);

    const prepared = await compressImageToWebp(file, {
      maxWidth: kind === 'banner' || kind === 'background' ? 1800 : 1200,
      quality: 0.84,
    });

    const safeName = normalizeAssetFileName(prepared.name);
    const folder =
      kind === 'button' && buttonId
        ? `${clinicId}/${hubId}/buttons/${buttonId}`
        : `${clinicId}/${hubId}/${kind}`;
    const storage_path = `${folder}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storage_path, prepared, {
        contentType: prepared.type || 'image/webp',
        upsert: false,
        cacheControl: '3600',
      });

    if (uploadError) {
      const msg = uploadError.message || '';
      if (/mime|type/i.test(msg)) {
        throw new Error('Escolha uma imagem JPG, PNG ou WebP.');
      }
      if (/size|large|limit/i.test(msg)) {
        throw new Error('A imagem ultrapassa o tamanho permitido.');
      }
      throw new Error('Não foi possível enviar a imagem.');
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storage_path);

    return {
      storage_path,
      public_url: `${urlData.publicUrl}?v=${Date.now()}`,
      file_name: prepared.name,
      file_type: prepared.type || 'image/webp',
    };
  },
};

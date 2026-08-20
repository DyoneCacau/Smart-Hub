import { assetRepository } from '@/repositories/smartHub';
import type {
  ListQueryParams,
  PaginatedResult,
  SmartHubAsset,
  SmartHubAssetKind,
} from '@/types/smartHub';

export const AssetService = {
  listByHub(
    hubId: string,
    clinicId: string,
    params?: Omit<ListQueryParams, 'clinicId'>
  ): Promise<PaginatedResult<SmartHubAsset>> {
    return assetRepository.listByHub(hubId, clinicId, params);
  },

  async upload(
    clinicId: string,
    hubId: string,
    file: File,
    opts?: {
      userId?: string | null;
      kind?: SmartHubAssetKind;
      buttonId?: string | null;
      previousStoragePath?: string | null;
    }
  ): Promise<SmartHubAsset> {
    const kind = opts?.kind ?? 'other';
    const uploaded = await assetRepository.uploadFile(
      clinicId,
      hubId,
      file,
      kind,
      opts?.buttonId
    );

    if (opts?.previousStoragePath) {
      await assetRepository.removeStoragePath(opts.previousStoragePath);
    }

    return assetRepository.create({
      clinic_id: clinicId,
      hub_id: hubId,
      file_name: uploaded.file_name,
      file_type: uploaded.file_type,
      storage_path: uploaded.storage_path,
      public_url: uploaded.public_url,
      asset_kind: kind,
      status: 'active',
      created_by: opts?.userId ?? null,
      updated_by: opts?.userId ?? null,
    });
  },

  softDelete(id: string, clinicId: string, userId?: string | null): Promise<void> {
    return assetRepository.softDelete(id, clinicId, userId);
  },

  removeStoragePath(path: string | null | undefined): Promise<void> {
    return assetRepository.removeStoragePath(path);
  },
};

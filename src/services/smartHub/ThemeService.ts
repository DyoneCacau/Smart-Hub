import { themeRepository } from '@/repositories/smartHub';
import type { SmartHubTheme } from '@/types/smartHub';

export const ThemeService = {
  getByHubId(hubId: string, clinicId: string): Promise<SmartHubTheme | null> {
    return themeRepository.getByHubId(hubId, clinicId);
  },

  upsert(
    clinicId: string,
    hubId: string,
    payload: Partial<SmartHubTheme>,
    userId?: string | null
  ): Promise<SmartHubTheme> {
    return themeRepository.upsert(clinicId, hubId, payload, userId);
  },
};

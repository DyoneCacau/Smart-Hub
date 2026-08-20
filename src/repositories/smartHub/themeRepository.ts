import { supabase } from '@/integrations/supabase/client';
import type { SmartHubTheme } from '@/types/smartHub';

const TABLE = 'smart_hub_theme';

export const themeRepository = {
  async getByHubId(hubId: string, clinicId: string): Promise<SmartHubTheme | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('hub_id', hubId)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    return data as SmartHubTheme | null;
  },

  async upsert(
    clinicId: string,
    hubId: string,
    payload: Partial<SmartHubTheme>,
    userId?: string | null
  ): Promise<SmartHubTheme> {
    const existing = await this.getByHubId(hubId, clinicId);

    if (existing) {
      const { data, error } = await supabase
        .from(TABLE)
        .update({
          ...payload,
          updated_by: userId ?? null,
        } as never)
        .eq('id', existing.id)
        .eq('clinic_id', clinicId)
        .select('*')
        .single();

      if (error) throw error;
      return data as SmartHubTheme;
    }

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        clinic_id: clinicId,
        hub_id: hubId,
        ...payload,
        created_by: userId ?? null,
        updated_by: userId ?? null,
      } as never)
      .select('*')
      .single();

    if (error) throw error;
    return data as SmartHubTheme;
  },
};

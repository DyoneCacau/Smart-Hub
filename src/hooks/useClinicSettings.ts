import { useCallback, useMemo } from 'react';
import { isSupabaseConfigured } from '@/integrations/supabase/client';
import { CLINIC_SETTINGS_KEY, resolveBusinessHours, type ClinicSettings } from '@/lib/clinicSettings';
import { getHealthSegment, type HealthSegmentId } from '@/lib/healthSegments';
import { useLocalValue } from './useLocalCollection';
import { useMyClinic } from './useMyClinic';

export type { ClinicSettings };

export function useClinicSettings() {
  const [stored, setStored] = useLocalValue<ClinicSettings>(CLINIC_SETTINGS_KEY);
  const { clinic, isLoading, updateClinic } = useMyClinic();

  const settings = useMemo<ClinicSettings | null>(() => {
    if (!isSupabaseConfigured) return stored;
    if (!clinic?.segment) return null;
    return {
      name: clinic.name,
      segment: clinic.segment as HealthSegmentId,
      businessHours: clinic.business_hours ?? undefined,
    };
  }, [stored, clinic]);

  const segment = useMemo(() => getHealthSegment(settings?.segment), [settings?.segment]);
  const businessHours = useMemo(() => resolveBusinessHours(settings), [settings]);

  const saveSettings = useCallback(
    async (next: ClinicSettings) => {
      if (!isSupabaseConfigured) {
        setStored(next);
        return;
      }
      await updateClinic({
        name: next.name,
        segment: next.segment,
        business_hours: next.businessHours ?? null,
      });
    },
    [setStored, updateClinic],
  );

  return {
    settings,
    isLoading,
    isConfigured: settings !== null,
    establishmentName: settings?.name.trim() || null,
    segment,
    businessHours,
    saveSettings,
  };
}

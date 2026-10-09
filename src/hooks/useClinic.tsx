import { isSupabaseConfigured } from '@/integrations/supabase/client';
import { LOCAL_CLINIC_ID } from '@/lib/clinicSettings';
import { useClinicSettings } from './useClinicSettings';
import { useMyClinic } from './useMyClinic';

/** Clínica ativa: a do usuário logado no Supabase ou a clínica única do modo local. */
export function useClinic() {
  const { establishmentName, segment } = useClinicSettings();
  const { clinic: remoteClinic, isLoading, error } = useMyClinic();

  const clinic = isSupabaseConfigured
    ? remoteClinic && { ...remoteClinic, name: remoteClinic.name || segment.label, isOwner: true }
    : { id: LOCAL_CLINIC_ID, name: establishmentName ?? segment.label, isOwner: true };

  return {
    clinic,
    clinicId: clinic?.id,
    isOwner: clinic?.isOwner,
    isLoading,
    error,
  };
}

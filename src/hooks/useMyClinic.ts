import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isSupabaseConfigured } from '@/integrations/supabase/client';
import { remoteDb } from '@/integrations/supabase/remoteDb';
import type { BusinessHours } from '@/lib/clinicSettings';
import { useAuth } from './useAuth';

export interface ClinicRow {
  id: string;
  owner_id: string;
  name: string;
  segment: string | null;
  business_hours: BusinessHours | null;
  timezone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ClinicChanges = Partial<Pick<ClinicRow, 'name' | 'segment' | 'business_hours'>>;

/** Clínica do usuário logado no Supabase (criada no cadastro por `ensure_my_clinic`). */
export function useMyClinic() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['my-clinic', user?.id];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data: row, error: rpcError } = await remoteDb.rpc('ensure_my_clinic');
      if (rpcError) throw rpcError;
      return row as ClinicRow;
    },
    enabled: isSupabaseConfigured && !!user?.id,
    staleTime: 1000 * 60 * 5,
  });

  const clinicId = data?.id;
  const updateClinic = useCallback(
    async (changes: ClinicChanges) => {
      if (!clinicId) throw new Error('Clínica não carregada.');
      const { data: row, error: updateError } = await remoteDb
        .from('clinics')
        .update(changes)
        .eq('id', clinicId)
        .select()
        .single();
      if (updateError) throw updateError;
      queryClient.setQueryData(['my-clinic', user?.id], row as ClinicRow);
    },
    [clinicId, queryClient, user?.id],
  );

  return {
    clinic: data ?? null,
    isLoading: isSupabaseConfigured && !!user?.id && isLoading,
    error,
    updateClinic,
  };
}

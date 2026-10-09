import { useMemo } from 'react';
import { isSupabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type ClinicStaffOption = {
  id: string;
  name: string;
  role?: string | null;
};

/** Usuários da clínica (responsável pelos contatos do Smart Hub): só o dono da conta. */
export function useClinicStaffOptions() {
  const { user, profile } = useAuth();

  const staff = useMemo<ClinicStaffOption[]>(() => {
    // Sem backend o usuário local não tem UUID válido para ser responsável.
    if (!isSupabaseConfigured || !user) return [];
    return [{ id: user.id, name: profile?.name || user.email || 'Administrador', role: 'admin' }];
  }, [user, profile?.name]);

  return { staff, isLoading: false };
}

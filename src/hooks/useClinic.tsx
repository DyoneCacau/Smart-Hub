import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useSelectedClinicId } from './useSelectedClinicId';

export function useClinic() {
  const { user, isSuperAdmin } = useAuth();
  const { selectedClinicId } = useSelectedClinicId();

  const { data: clinic, isLoading, error } = useQuery({
    queryKey: ['clinic', user?.id, isSuperAdmin, selectedClinicId],
    queryFn: async () => {
      if (!user?.id) return null;

      if (isSuperAdmin) {
        if (selectedClinicId) {
          const { data: selectedClinic, error: selectedClinicError } = await supabase
            .from('clinics')
            .select('*')
            .eq('id', selectedClinicId)
            .maybeSingle();

          if (selectedClinicError) throw selectedClinicError;
          if (selectedClinic) {
            return {
              ...selectedClinic,
              isOwner: false,
            };
          }
        }
        return null; // SuperAdmin com "Nenhuma" selecionada
      }

      // Buscar todas as clínicas do usuário (para respeitar selectedClinicId quando houver mais de uma)
      const { data: clinicUserRows, error: clinicUserError } = await supabase
        .from('clinic_users')
        .select('clinic_id, is_owner, clinics(*)')
        .eq('user_id', user.id)
        .order('is_owner', { ascending: false })
        .order('created_at', { ascending: true });

      if (clinicUserError) throw clinicUserError;
      if (!clinicUserRows?.length) return null;

      // Se o usuário escolheu uma clínica no seletor e ela está na lista, usar essa
      if (selectedClinicId) {
        const selected = clinicUserRows.find((r: any) => r.clinic_id === selectedClinicId);
        if (selected?.clinics) {
          const clinicData = Array.isArray(selected.clinics) ? selected.clinics[0] : selected.clinics;
          return { ...clinicData, isOwner: selected.is_owner };
        }
      }

      // Senão, usar a primeira (dono primeiro, depois por criação)
      const clinicUser = clinicUserRows[0];
      const clinicData = Array.isArray(clinicUser.clinics) ? clinicUser.clinics[0] : clinicUser.clinics;
      return {
        ...clinicData,
        isOwner: clinicUser.is_owner,
      };
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutos — clínica ativa não muda a cada navegação
  });

  return {
    clinic,
    clinicId: clinic?.id,
    isOwner: clinic?.isOwner,
    isLoading,
    error,
  };
}

export function useClinics() {
  const { user, isSuperAdmin } = useAuth();

  const { data: clinics, isLoading, error } = useQuery({
    queryKey: ['all-clinics', user?.id, isSuperAdmin],
    queryFn: async () => {
      if (isSuperAdmin) {
        const { data, error } = await supabase
          .from('clinics')
          .select('*')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        return data || [];
      }

      if (!user?.id) return [];

      // Todas as clínicas em que o usuário está cadastrado (inclui recepcionista, não só dono)
      const { data: cuData, error } = await supabase
        .from('clinic_users')
        .select('clinic_id, is_owner, clinics(*)')
        .eq('user_id', user.id);

      if (error) throw error;

      const clinicsFromUser = (cuData || [])
        .map((row: any) => row.clinics)
        .filter(Boolean)
        .filter((c: any) => c.is_active !== false);

      if (clinicsFromUser.length === 0) return [];

      // Contagem de usuários por clínica (para exibir em Minhas Clínicas)
      const clinicIds = clinicsFromUser.map((c: any) => c.id);
      const { data: countRows } = await supabase
        .from('clinic_users')
        .select('clinic_id')
        .in('clinic_id', clinicIds);

      const countByClinic: Record<string, number> = {};
      clinicIds.forEach((id: string) => { countByClinic[id] = 0; });
      (countRows || []).forEach((r: any) => {
        if (r.clinic_id && countByClinic[r.clinic_id] !== undefined) countByClinic[r.clinic_id]++;
      });

      return clinicsFromUser.map((c: any) => ({
        ...c,
        user_count: countByClinic[c.id] ?? 0,
      }));
    },
    enabled: !!user?.id || isSuperAdmin,
    staleTime: 1000 * 60 * 5,
  });

  return { clinics: clinics || [], isLoading, error };
}

/**
 * Retorna todas as clínicas do mesmo dono (owner_user_id) das clínicas em que o usuário está.
 * Usa RPC para contornar o RLS de clinics (que só permite ver clínicas em que está em clinic_users).
 * Usado na Agenda quando tem permissão "Agenda - todas as clínicas".
 */
export function useClinicsOfSameOwner() {
  const { user } = useAuth();

  const { data: clinics, isLoading, error } = useQuery({
    queryKey: ['clinics-of-same-owner', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error: rpcError } = await supabase.rpc('get_clinics_of_same_owner', {
        p_user_id: user.id,
      });

      if (rpcError) return [];
      return Array.isArray(data) ? data : [];
    },
    enabled: !!user?.id,
  });

  return { clinics: clinics || [], isLoading, error };
}

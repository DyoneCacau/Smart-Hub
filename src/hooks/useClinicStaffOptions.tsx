import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClinic } from './useClinic';

export type ClinicStaffOption = {
  id: string;
  name: string;
  role?: string | null;
};

/** Usuários da clínica ativa (para responsável do CRM / vendedor). */
export function useClinicStaffOptions() {
  const { clinicId } = useClinic();

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['clinic-staff-options', clinicId],
    queryFn: async () => {
      if (!clinicId) return [] as ClinicStaffOption[];

      const { data: clinicUsers, error } = await supabase
        .from('clinic_users')
        .select('user_id')
        .eq('clinic_id', clinicId);

      if (error) throw error;
      const userIds = (clinicUsers || []).map((r: { user_id: string }) => r.user_id);
      if (userIds.length === 0) return [] as ClinicStaffOption[];

      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from('profiles').select('user_id, name').in('user_id', userIds),
        supabase
          .from('user_roles')
          .select('user_id, role')
          .in('user_id', userIds)
          .in('role', ['admin', 'receptionist', 'seller', 'professional']),
      ]);

      const roleMap = new Map(
        (roles || []).map((r: { user_id: string; role: string }) => [r.user_id, r.role]),
      );

      return (profiles || [])
        .map((p: { user_id: string; name: string | null }) => ({
          id: p.user_id,
          name: p.name || 'Usuário',
          role: roleMap.get(p.user_id) || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    },
    enabled: !!clinicId,
  });

  return { staff, isLoading };
}

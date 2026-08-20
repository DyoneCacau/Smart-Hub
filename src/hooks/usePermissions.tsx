import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getDefaultPermissionsForRole, type SystemRole } from '@/lib/permissionsConstants';
import { useAuth } from './useAuth';
import { useClinic } from './useClinic';

export type PermissionAction = 'can_view' | 'can_create' | 'can_edit' | 'can_delete';

/** Feature que quando true em qualquer clínica do usuário libera ver todas as unidades na Agenda */
const AGENDA_ALL_CLINICS_FEATURE = 'agenda_todas_clinicas';

export function usePermissions() {
  const { user, isSuperAdmin } = useAuth();
  const { clinicId } = useClinic();

  const { data: permissions, isLoading } = useQuery({
    queryKey: ['permissions', user?.id, clinicId, isSuperAdmin],
    queryFn: async () => {
      if (!user?.id || !clinicId) return null;
      if (isSuperAdmin) {
        return 'full' as const; // superadmin tem tudo
      }

      // Verificar se tem função personalizada nesta clínica
      const { data: customRoleRow, error: customRoleError } = await supabase
        .from('user_clinic_custom_roles')
        .select('clinic_custom_role_id')
        .eq('user_id', user.id)
        .eq('clinic_id', clinicId)
        .maybeSingle();

      if (customRoleError) {
        console.warn('[usePermissions] custom role lookup failed:', customRoleError.message);
      }

      if (customRoleRow?.clinic_custom_role_id) {
        const { data: perms } = await supabase
          .from('clinic_custom_role_permissions')
          .select('feature, can_view, can_create, can_edit, can_delete')
          .eq('clinic_custom_role_id', customRoleRow.clinic_custom_role_id);
        const map: Record<string, { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }> = {};
        (perms || []).forEach((p: any) => {
          map[p.feature] = { can_view: p.can_view, can_create: p.can_create, can_edit: p.can_edit, can_delete: p.can_delete };
        });
        // Sem linhas salvas: acesso pleno (comportamento atual). Com matriz parcial,
        // features novas (ex.: procedimentos) usam default negado até o admin salvar.
        if (Object.keys(map).length === 0) return 'full';
        return map;
      }

      // Buscar role do sistema (user_roles)
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'receptionist', 'seller', 'professional'])
        .maybeSingle();

      const role = roleRow?.role as string | undefined;
      if (!role) return null;

      const { data: perms } = await supabase
        .from('clinic_role_permissions')
        .select('feature, can_view, can_create, can_edit, can_delete')
        .eq('clinic_id', clinicId)
        .eq('role', role);

      const map: Record<string, { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }> = {};
      (perms || []).forEach((p: any) => {
        map[p.feature] = { can_view: p.can_view, can_create: p.can_create, can_edit: p.can_edit, can_delete: p.can_delete };
      });

      // Se não há permissões salvas para esta clínica/role, mantém comportamento atual (acesso pelo plano)
      if (Object.keys(map).length === 0) return 'full';

      // Features novas ainda sem linha na matriz: aplica default da role (admin = tudo)
      getDefaultPermissionsForRole(role as SystemRole).forEach((row) => {
        if (!map[row.feature]) {
          map[row.feature] = {
            can_view: row.can_view,
            can_create: row.can_create,
            can_edit: row.can_edit,
            can_delete: row.can_delete,
          };
        }
      });

      return map;
    },
    enabled: !!user?.id && !!clinicId,
    staleTime: 1000 * 60 * 5, // 5 minutos — matriz de permissões não muda a cada aba
  });

  const can = (feature: string, action: PermissionAction): boolean => {
    if (isSuperAdmin) return true;
    if (permissions === 'full') return true;
    if (!permissions || typeof permissions !== 'object') return false;
    const p = permissions[feature];
    if (!p) return false;
    return p[action] === true;
  };

  // Para "Agenda - todas as clínicas": considerar true se tiver permissão na clínica atual OU em qualquer clínica do usuário
  const { data: hasAgendaAllClinicsInAnyClinic } = useQuery({
    queryKey: ['permissions-agenda-all-clinics-any', user?.id, isSuperAdmin],
    queryFn: async () => {
      if (!user?.id || isSuperAdmin) return false;
      const { data: cu } = await supabase.from('clinic_users').select('clinic_id').eq('user_id', user.id);
      if (!cu?.length) return false;
      const clinicIds = cu.map((r: { clinic_id: string }) => r.clinic_id);
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'receptionist', 'seller', 'professional'])
        .maybeSingle();
      const role = roleRow?.role as string | undefined;
      if (!role) return false;
      const { data: perms } = await supabase
        .from('clinic_role_permissions')
        .select('clinic_id')
        .in('clinic_id', clinicIds)
        .eq('role', role)
        .eq('feature', AGENDA_ALL_CLINICS_FEATURE)
        .eq('can_view', true)
        .limit(1);
      return (perms?.length ?? 0) > 0;
    },
    enabled: !!user?.id && !isSuperAdmin,
    staleTime: 1000 * 60 * 5,
  });

  const canSeeAllClinicsInAgenda = (): boolean =>
    isSuperAdmin || can(AGENDA_ALL_CLINICS_FEATURE, 'can_view') || !!hasAgendaAllClinicsInAnyClinic;

  return { permissions, isLoading, can, canSeeAllClinicsInAgenda };
}

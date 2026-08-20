import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

const PREFERENCE_KEY = 'selected_clinic_id';
const STORAGE_KEY = 'superadmin_clinic_id';
const CHANGE_EVENT = 'superadmin_clinic_change';

function getFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useSelectedClinicId() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [fallbackValue, setFallbackValue] = useState<string | null>(() => getFromStorage());

  const { data: dbValue, isLoading, isError } = useQuery({
    queryKey: ['user-preference', user?.id, PREFERENCE_KEY],
    queryFn: async () => {
      if (!user?.id) return null;
      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('preference_value')
          .eq('user_id', user.id)
          .eq('preference_key', PREFERENCE_KEY)
          .maybeSingle();
        if (error) throw error;
        return data?.preference_value?.trim() || null;
      } catch {
        return null;
      }
    },
    enabled: !!user?.id,
    retry: false,
  });

  const upsertPreference = useMutation({
    mutationFn: async (value: string | null) => {
      if (!user?.id) return;
      try {
        if (value) {
          const { error } = await supabase.from('user_preferences').upsert(
            {
              user_id: user.id,
              preference_key: PREFERENCE_KEY,
              preference_value: value,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,preference_key' }
          );
          if (error) throw error;
        } else {
          await supabase
            .from('user_preferences')
            .delete()
            .eq('user_id', user.id)
            .eq('preference_key', PREFERENCE_KEY);
        }
      } catch {
        // Tabela pode não existir; usar localStorage
      }
    },
    onSuccess: (_, value) => {
      queryClient.setQueryData(['user-preference', user?.id, PREFERENCE_KEY], value);
    },
  });

  const setSelectedClinicId = (id: string | null) => {
    if (typeof window === 'undefined') return;
    setFallbackValue(id);
    if (id) {
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        // ignore
      }
    } else {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    if (user?.id) {
      queryClient.setQueryData(['user-preference', user.id, PREFERENCE_KEY], id);
      upsertPreference.mutate(id);
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: id }));
  };

  useEffect(() => {
    const handleCustomChange = (event: Event) => {
      const detail = (event as CustomEvent<string | null>).detail;
      setFallbackValue(detail);
      if (user?.id) {
        queryClient.setQueryData(['user-preference', user.id, PREFERENCE_KEY], detail);
      }
    };
    window.addEventListener(CHANGE_EVENT, handleCustomChange);
    return () => window.removeEventListener(CHANGE_EVENT, handleCustomChange);
  }, [user?.id, queryClient]);

  const raw =
    user?.id && !isError && dbValue !== undefined
      ? (dbValue ?? null)
      : (fallbackValue ?? getFromStorage());

  const selectedClinicId = (typeof raw === 'string' && raw.trim()) ? raw.trim() : null;

  return { selectedClinicId, setSelectedClinicId };
}

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isSupabaseConfigured } from '@/integrations/supabase/client';
import { remoteDb } from '@/integrations/supabase/remoteDb';
import { useMyClinic } from './useMyClinic';

export type WhatsAppMessageKind = 'booking' | 'day_before' | 'same_day';

export interface WhatsAppSettings {
  is_active: boolean;
  booking_enabled: boolean;
  booking_webhook_url: string | null;
  day_before_enabled: boolean;
  day_before_time: string;
  day_before_webhook_url: string | null;
  same_day_enabled: boolean;
  same_day_hours_before: number;
  same_day_webhook_url: string | null;
}

export interface WhatsAppNotification {
  id: string;
  appointment_id: string | null;
  kind: WhatsAppMessageKind | 'test';
  phone: string;
  patient_name: string | null;
  status: 'queued' | 'sent' | 'error';
  http_status: number | null;
  error: string | null;
  created_at: string;
}

export const DEFAULT_WHATSAPP_SETTINGS: WhatsAppSettings = {
  is_active: false,
  booking_enabled: true,
  booking_webhook_url: null,
  day_before_enabled: true,
  day_before_time: '18:00',
  day_before_webhook_url: null,
  same_day_enabled: false,
  same_day_hours_before: 2,
  same_day_webhook_url: null,
};

const SETTINGS_COLUMNS =
  'is_active, booking_enabled, booking_webhook_url, day_before_enabled, day_before_time, day_before_webhook_url, same_day_enabled, same_day_hours_before, same_day_webhook_url';

/** Erro do PostgREST quando a tabela ainda não existe (SQL de atualização não rodado). */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

export class WhatsAppSetupMissingError extends Error {
  constructor() {
    super('Rode supabase/ATUALIZACAO_02_WHATSAPP_SURI.sql no SQL Editor do Supabase.');
  }
}

export function useWhatsAppSettings() {
  const { clinic } = useMyClinic();
  const clinicId = clinic?.id;
  const queryClient = useQueryClient();
  const enabled = isSupabaseConfigured && !!clinicId;

  const settingsQuery = useQuery({
    queryKey: ['whatsapp-settings', clinicId],
    enabled,
    retry: (count, error) => !(error instanceof WhatsAppSetupMissingError) && count < 2,
    queryFn: async (): Promise<WhatsAppSettings | null> => {
      const { data, error } = await remoteDb
        .from('clinic_whatsapp_settings')
        .select(SETTINGS_COLUMNS)
        .eq('clinic_id', clinicId)
        .maybeSingle();
      if (isMissingTable(error)) throw new WhatsAppSetupMissingError();
      if (error) throw error;
      if (!data) return null;
      const row = data as WhatsAppSettings;
      return { ...row, day_before_time: row.day_before_time.slice(0, 5) };
    },
  });

  const historyQuery = useQuery({
    queryKey: ['whatsapp-notifications', clinicId],
    enabled: enabled && !(settingsQuery.error instanceof WhatsAppSetupMissingError),
    refetchInterval: 30_000,
    queryFn: async (): Promise<WhatsAppNotification[]> => {
      const { data, error } = await remoteDb
        .from('whatsapp_notifications')
        .select('id, appointment_id, kind, phone, patient_name, status, http_status, error, created_at')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (isMissingTable(error)) throw new WhatsAppSetupMissingError();
      if (error) throw error;
      return (data ?? []) as WhatsAppNotification[];
    },
  });

  const saveSettings = useCallback(
    async (next: WhatsAppSettings) => {
      if (!clinicId) throw new Error('Clínica não carregada.');
      const { error } = await remoteDb
        .from('clinic_whatsapp_settings')
        .upsert({ clinic_id: clinicId, ...next }, { onConflict: 'clinic_id' });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['whatsapp-settings', clinicId] });
    },
    [clinicId, queryClient],
  );

  const sendTest = useCallback(
    async (kind: WhatsAppMessageKind, phone: string): Promise<{ ok: boolean; mensagem: string }> => {
      if (!clinicId) throw new Error('Clínica não carregada.');
      const { data, error } = await remoteDb.rpc('whatsapp_send_test', {
        p_clinic_id: clinicId,
        p_kind: kind,
        p_phone: phone,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['whatsapp-notifications', clinicId] });
      return data as { ok: boolean; mensagem: string };
    },
    [clinicId, queryClient],
  );

  const refreshHistory = useCallback(async () => {
    await remoteDb.rpc('whatsapp_refresh_status');
    await queryClient.invalidateQueries({ queryKey: ['whatsapp-notifications', clinicId] });
  }, [clinicId, queryClient]);

  return {
    settings: settingsQuery.data ?? null,
    isLoading: enabled && settingsQuery.isLoading,
    setupMissing: settingsQuery.error instanceof WhatsAppSetupMissingError,
    loadError: settingsQuery.error && !(settingsQuery.error instanceof WhatsAppSetupMissingError)
      ? settingsQuery.error
      : null,
    history: historyQuery.data ?? [],
    historyLoading: historyQuery.isLoading,
    saveSettings,
    sendTest,
    refreshHistory,
  };
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { toast } from 'sonner';
import type { CrmLead, CrmLeadInput, CrmStage } from '@/types/crm';

function mapLead(row: any): CrmLead {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    stageId: row.stage_id ?? null,
    name: row.name ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    company: row.company ?? null,
    interest: row.interest ?? null,
    estimatedValue: row.estimated_value == null ? null : Number(row.estimated_value),
    source: row.source ?? null,
    medium: row.medium ?? null,
    campaign: row.campaign ?? null,
    firstTouchSource: row.first_touch_source ?? null,
    firstTouchMedium: row.first_touch_medium ?? null,
    firstTouchCampaign: row.first_touch_campaign ?? null,
    lastTouchSource: row.last_touch_source ?? null,
    lastTouchMedium: row.last_touch_medium ?? null,
    lastTouchCampaign: row.last_touch_campaign ?? null,
    utmSource: row.utm_source ?? null,
    utmMedium: row.utm_medium ?? null,
    utmCampaign: row.utm_campaign ?? null,
    utmContent: row.utm_content ?? null,
    utmTerm: row.utm_term ?? null,
    ownerUserId: row.owner_user_id ?? null,
    integrationId: row.integration_id ?? null,
    externalLeadId: row.external_lead_id ?? null,
    visitorId: row.visitor_id ?? null,
    status: row.status ?? 'open',
    lostReason: row.lost_reason ?? null,
    notes: row.notes ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function useCrmStages() {
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: ['crm-stages', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('funnel_stages')
        .select('id,workspace_id,name,position,is_won,is_lost')
        .eq('workspace_id', workspaceId)
        .order('position');
      if (error) throw error;
      return (data || []).map((row: any): CrmStage => ({
        id: row.id,
        workspaceId: row.workspace_id,
        name: row.name,
        position: row.position,
        isWon: row.is_won,
        isLost: row.is_lost,
      }));
    },
  });
}

export function useCrmLeads() {
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: ['crm-leads', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('leads')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapLead);
    },
  });
}

export function useCrmLeadMutations() {
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['crm-leads', workspaceId] });
    queryClient.invalidateQueries({ queryKey: ['funnel-leads', workspaceId] });
  };

  const createLead = useMutation({
    mutationFn: async (input: CrmLeadInput) => {
      if (!workspaceId) throw new Error('Selecione um workspace');
      if (!input.name?.trim() && !input.phone?.trim() && !input.email?.trim()) {
        throw new Error('Informe ao menos nome, telefone ou e-mail');
      }

      const { data, error } = await (supabase as any).rpc('ingest_lead', {
        p_workspace_id: workspaceId,
        p_name: input.name?.trim() || null,
        p_phone: input.phone?.trim() || null,
        p_email: input.email?.trim() || null,
        p_source: input.source || 'manual',
        p_medium: input.medium || null,
        p_campaign: input.campaign || null,
        p_utm_source: input.utm_source || null,
        p_utm_medium: input.utm_medium || null,
        p_utm_campaign: input.utm_campaign || null,
        p_utm_content: input.utm_content || null,
        p_utm_term: input.utm_term || null,
        p_integration_id: null,
        p_external_lead_id: null,
        p_visitor_id: null,
        p_metadata: input.metadata || {},
      });
      if (error) throw error;

      if (input.company || input.interest || input.estimated_value || input.notes || input.stage_id) {
        const updates: Record<string, unknown> = {};
        if (input.company !== undefined) updates.company = input.company || null;
        if (input.interest !== undefined) updates.interest = input.interest || null;
        if (input.estimated_value !== undefined) updates.estimated_value = input.estimated_value;
        if (input.notes !== undefined) updates.notes = input.notes || null;
        if (input.stage_id !== undefined) updates.stage_id = input.stage_id;
        const { data: updated, error: updateError } = await (supabase as any)
          .from('leads')
          .update(updates)
          .eq('id', data.id)
          .select('*')
          .single();
        if (updateError) throw updateError;
        return mapLead(updated);
      }

      return mapLead(data);
    },
    onSuccess: () => {
      invalidate();
      toast.success('Lead adicionado ao funil');
    },
    onError: (error: Error) => toast.error(error.message || 'Erro ao criar lead'),
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, ...input }: CrmLeadInput & { id: string }) => {
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (input.name !== undefined) payload.name = input.name?.trim() || null;
      if (input.phone !== undefined) payload.phone = input.phone?.trim() || null;
      if (input.email !== undefined) payload.email = input.email?.trim() || null;
      if (input.company !== undefined) payload.company = input.company?.trim() || null;
      if (input.interest !== undefined) payload.interest = input.interest?.trim() || null;
      if (input.estimated_value !== undefined) payload.estimated_value = input.estimated_value;
      if (input.stage_id !== undefined) payload.stage_id = input.stage_id;
      if (input.source !== undefined) payload.source = input.source;
      if (input.medium !== undefined) payload.medium = input.medium;
      if (input.campaign !== undefined) payload.campaign = input.campaign;
      if (input.owner_user_id !== undefined) payload.owner_user_id = input.owner_user_id;
      if (input.lost_reason !== undefined) payload.lost_reason = input.lost_reason;
      if (input.notes !== undefined) payload.notes = input.notes;
      if (input.metadata !== undefined) payload.metadata = input.metadata;

      const { data, error } = await (supabase as any)
        .from('leads')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return mapLead(data);
    },
    onSuccess: invalidate,
    onError: () => toast.error('Erro ao atualizar lead'),
  });

  const moveLeadStage = useMutation({
    mutationFn: async ({ id, stageId }: { id: string; stageId: string }) => {
      const { data: stage, error: stageError } = await (supabase as any)
        .from('funnel_stages')
        .select('is_won,is_lost')
        .eq('id', stageId)
        .single();
      if (stageError) throw stageError;

      const { error } = await (supabase as any)
        .from('leads')
        .update({
          stage_id: stageId,
          status: stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'open',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;

      if (workspaceId) {
        await (supabase as any).from('funnel_events').insert({
          workspace_id: workspaceId,
          event_name: 'crm_stage_changed',
          lead_id: id,
          properties: { stage_id: stageId },
        });
      }
    },
    onSuccess: invalidate,
    onError: () => toast.error('Erro ao mover lead'),
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('leads').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => toast.error('Erro ao remover lead'),
  });

  return { createLead, updateLead, moveLeadStage, deleteLead };
}

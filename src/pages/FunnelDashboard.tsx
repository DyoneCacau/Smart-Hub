import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';

interface StageRow {
  id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
}

interface LeadRow {
  id: string;
  stage_id: string | null;
  source: string | null;
  campaign: string | null;
}

interface EventRow {
  event_name: string;
  visitor_id: string | null;
  source: string | null;
  campaign: string | null;
}

export default function FunnelDashboard() {
  const { workspaceId, workspace } = useWorkspace();

  const { data: stages = [] } = useQuery({
    queryKey: ['funnel-stages', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('funnel_stages').select('id,name,position,is_won,is_lost').eq('workspace_id', workspaceId).order('position');
      if (error) throw error;
      return (data || []) as StageRow[];
    },
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['funnel-leads', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('leads').select('id,stage_id,source,campaign').eq('workspace_id', workspaceId);
      if (error) throw error;
      return (data || []) as LeadRow[];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ['funnel-events-summary', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('funnel_events').select('event_name,visitor_id,source,campaign').eq('workspace_id', workspaceId);
      if (error) throw error;
      return (data || []) as EventRow[];
    },
  });

  const byStage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) if (lead.stage_id) counts.set(lead.stage_id, (counts.get(lead.stage_id) || 0) + 1);
    return counts;
  }, [leads]);

  const sources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      const source = lead.source || 'manual';
      counts.set(source, (counts.get(source) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [leads]);

  const campaigns = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      if (!lead.campaign) continue;
      counts.set(lead.campaign, (counts.get(lead.campaign) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [leads]);

  const visitors = new Set(events.map((event) => event.visitor_id).filter(Boolean)).size;
  const visits = events.filter((event) => event.event_name === 'page_view' || event.event_name === 'smart_hub_visit' || event.event_name === 'form_view').length;
  const clicks = events.filter((event) => event.event_name === 'click' || event.event_name === 'smart_hub_click' || event.event_name === 'whatsapp_clicked').length;
  const formStarted = events.filter((event) => event.event_name === 'form_started').length;
  const formSubmitted = events.filter((event) => event.event_name === 'form_submitted').length;
  const wonStageIds = new Set(stages.filter((stage) => stage.is_won).map((stage) => stage.id));
  const won = leads.filter((lead) => lead.stage_id && wonStageIds.has(lead.stage_id)).length;
  const leadConversion = leads.length ? (won / leads.length) * 100 : 0;
  const visitorToLead = visitors ? (leads.length / visitors) * 100 : 0;
  const formCompletion = formStarted ? (formSubmitted / formStarted) * 100 : 0;

  if (!workspaceId) return null;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Funil de conversão</h1>
        <p className="text-muted-foreground">{workspace?.name || 'Workspace'} · {workspace?.segment || 'segmento'} · {workspace?.objective || 'objetivo'}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Card><CardHeader><CardTitle className="text-sm">Visitantes</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{visitors}</div><div className="text-xs text-muted-foreground">{visits} eventos de visita</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Cliques</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{clicks}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Iniciaram formulário</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{formStarted}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Briefings enviados</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{formSubmitted}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Leads</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{leads.length}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Conversões</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{won}</div></CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Jornada de aquisição</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3"><span>Visitantes únicos</span><strong>{visitors}</strong></div>
            <div className="flex items-center justify-between rounded-lg border p-3"><span>Cliques / interações</span><strong>{clicks}</strong></div>
            <div className="flex items-center justify-between rounded-lg border p-3"><span>Iniciaram briefing</span><strong>{formStarted}</strong></div>
            <div className="flex items-center justify-between rounded-lg border p-3"><span>Enviaram briefing</span><strong>{formSubmitted}</strong></div>
            <div className="flex items-center justify-between rounded-lg border p-3"><span>Leads no CRM</span><strong>{leads.length}</strong></div>
            <div className="flex items-center justify-between rounded-lg border p-3"><span>Conversões</span><strong>{won}</strong></div>
            <div className="grid gap-2 pt-2 text-sm text-muted-foreground sm:grid-cols-3">
              <span>Visitante → lead: {visitorToLead.toFixed(1)}%</span>
              <span>Briefing concluído: {formCompletion.toFixed(1)}%</span>
              <span>Lead → conversão: {leadConversion.toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Pipeline</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {stages.map((stage) => <div key={stage.id} className="flex items-center justify-between rounded-lg border p-3"><span>{stage.name}</span><strong>{byStage.get(stage.id) || 0}</strong></div>)}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Origem dos leads</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {sources.length === 0 ? <p className="text-sm text-muted-foreground">Ainda não há leads capturados.</p> : sources.map(([source, count]) => <div key={source} className="flex items-center justify-between rounded-lg border p-3"><span>{source}</span><strong>{count}</strong></div>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Campanhas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {campaigns.length === 0 ? <p className="text-sm text-muted-foreground">Use UTMs ou defina uma campanha no formulário para comparar resultados.</p> : campaigns.map(([campaign, count]) => <div key={campaign} className="flex items-center justify-between rounded-lg border p-3"><span>{campaign}</span><strong>{count} leads</strong></div>)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

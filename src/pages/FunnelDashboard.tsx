import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

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
}

export default function FunnelDashboard() {
  const workspaceId = localStorage.getItem('activeWorkspaceId');

  const { data: stages = [] } = useQuery({
    queryKey: ['funnel-stages', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('funnel_stages')
        .select('id,name,position,is_won,is_lost')
        .eq('workspace_id', workspaceId)
        .order('position');
      if (error) throw error;
      return (data || []) as StageRow[];
    },
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['funnel-leads', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('leads')
        .select('id,stage_id,source')
        .eq('workspace_id', workspaceId);
      if (error) throw error;
      return (data || []) as LeadRow[];
    },
  });

  const byStage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      if (lead.stage_id) counts.set(lead.stage_id, (counts.get(lead.stage_id) || 0) + 1);
    }
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

  const wonStageIds = new Set(stages.filter((stage) => stage.is_won).map((stage) => stage.id));
  const won = leads.filter((lead) => lead.stage_id && wonStageIds.has(lead.stage_id)).length;
  const conversion = leads.length ? (won / leads.length) * 100 : 0;

  if (!workspaceId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center">
            Configure seu workspace para começar a acompanhar o funil.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Funil de conversão</h1>
        <p className="text-muted-foreground">Todos os canais alimentam o mesmo CRM e a mesma jornada.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Leads</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{leads.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Conversões</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{won}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Taxa lead → conversão</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{conversion.toFixed(1)}%</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Pipeline</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {stages.map((stage) => (
              <div key={stage.id} className="flex items-center justify-between rounded-lg border p-3">
                <span>{stage.name}</span>
                <strong>{byStage.get(stage.id) || 0}</strong>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Origem dos leads</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda não há leads capturados.</p>
            ) : sources.map(([source, count]) => (
              <div key={source} className="flex items-center justify-between rounded-lg border p-3">
                <span>{source}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

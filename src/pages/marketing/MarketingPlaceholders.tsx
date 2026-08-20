import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { toast } from 'sonner';

export function MarketingCrm() {
  const navigate = useNavigate();
  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Marketing + CRM</h1>
        <p className="text-muted-foreground">Campanhas, páginas e canais terminam no mesmo CRM universal.</p>
      </div>
      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-6">
          <div>
            <div className="font-medium">Pipeline centralizado</div>
            <div className="text-sm text-muted-foreground">Acompanhe os leads capturados por todos os canais.</div>
          </div>
          <Button onClick={() => navigate('/crm')}>Abrir CRM</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function MarketingCampaigns() {
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [medium, setMedium] = useState('');

  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('campaigns')
        .select('id,name,channel,utm_source,utm_medium,utm_campaign,status,created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const createCampaign = async () => {
    if (!workspaceId || !name.trim()) return;
    const slug = name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const { error } = await (supabase as any).from('campaigns').insert({
      workspace_id: workspaceId,
      name: name.trim(),
      channel: medium.trim() || null,
      utm_source: source.trim() || null,
      utm_medium: medium.trim() || null,
      utm_campaign: slug,
      status: 'active',
    });
    if (error) {
      toast.error('Não foi possível criar a campanha');
      return;
    }
    setName('');
    setSource('');
    setMedium('');
    await queryClient.invalidateQueries({ queryKey: ['campaigns', workspaceId] });
    toast.success('Campanha criada');
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Campanhas</h1>
        <p className="text-muted-foreground">Padronize UTM e acompanhe a origem real de cada lead.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Nova campanha</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Black Friday" /></div>
          <div className="space-y-2"><Label>UTM source</Label><Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="instagram" /></div>
          <div className="space-y-2"><Label>UTM medium</Label><Input value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="paid_social" /></div>
          <div className="flex items-end"><Button className="w-full" onClick={() => void createCampaign()}>Criar campanha</Button></div>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {campaigns.map((campaign: any) => (
          <Card key={campaign.id}>
            <CardContent className="grid gap-2 py-4 md:grid-cols-4">
              <div><div className="text-xs text-muted-foreground">Campanha</div><div className="font-medium">{campaign.name}</div></div>
              <div><div className="text-xs text-muted-foreground">Source</div><div>{campaign.utm_source || '—'}</div></div>
              <div><div className="text-xs text-muted-foreground">Medium</div><div>{campaign.utm_medium || '—'}</div></div>
              <div><div className="text-xs text-muted-foreground">UTM campaign</div><div>{campaign.utm_campaign || '—'}</div></div>
            </CardContent>
          </Card>
        ))}
        {campaigns.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma campanha cadastrada.</p>}
      </div>
    </div>
  );
}

export function MarketingLandingPages() {
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('');

  const { data: pages = [] } = useQuery({
    queryKey: ['landing-pages', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('landing_pages')
        .select('id,name,slug,status,headline,created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const createPage = async () => {
    if (!workspaceId || !name.trim()) return;
    const slug = name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { error } = await (supabase as any).from('landing_pages').insert({
      workspace_id: workspaceId,
      name: name.trim(),
      slug,
      headline: headline.trim() || name.trim(),
      status: 'draft',
    });
    if (error) {
      toast.error('Não foi possível criar a landing page');
      return;
    }
    setName('');
    setHeadline('');
    await queryClient.invalidateQueries({ queryKey: ['landing-pages', workspaceId] });
    toast.success('Landing page criada');
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Landing Pages</h1>
        <p className="text-muted-foreground">Crie pontos de entrada rastreáveis para campanhas e captação.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Nova landing page</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-2"><Label>Headline</Label><Input value={headline} onChange={(e) => setHeadline(e.target.value)} /></div>
          <div className="flex items-end"><Button className="w-full" onClick={() => void createPage()}>Criar página</Button></div>
        </CardContent>
      </Card>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {pages.map((page: any) => (
          <Card key={page.id}>
            <CardHeader><CardTitle className="text-base">{page.name}</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div>/{page.slug}</div>
              <div className="text-muted-foreground">{page.headline || 'Sem headline'}</div>
              <div className="text-xs uppercase text-muted-foreground">{page.status}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function MarketingAnalytics() {
  const { workspaceId } = useWorkspace();
  const { data: leads = [] } = useQuery({
    queryKey: ['marketing-analytics-leads', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('leads')
        .select('source,medium,campaign,utm_source,utm_medium,utm_campaign')
        .eq('workspace_id', workspaceId);
      if (error) throw error;
      return data || [];
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, number>();
    for (const lead of leads as any[]) {
      const key = lead.utm_campaign || lead.campaign || lead.utm_source || lead.source || 'Sem origem';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [leads]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics de Marketing</h1>
        <p className="text-muted-foreground">Compare campanhas e canais pela quantidade de leads atribuídos.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Leads por origem/campanha</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {grouped.map(([label, count]) => (
            <div key={label} className="flex items-center justify-between rounded-lg border p-3">
              <span>{label}</span><strong>{count}</strong>
            </div>
          ))}
          {grouped.length === 0 && <p className="text-sm text-muted-foreground">Ainda não há dados de marketing.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

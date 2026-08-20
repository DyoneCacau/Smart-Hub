import { useMemo, useState } from 'react';
import { KanbanSquare, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCrmLeadMutations, useCrmLeads, useCrmStages } from '@/hooks/useCrmLeads';
import { useWorkspace } from '@/hooks/useWorkspace';
import type { CrmLead } from '@/types/crm';

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  company: '',
  interest: '',
  estimatedValue: '',
  source: 'manual',
  campaign: '',
  notes: '',
};

export default function Crm() {
  const { workspace, workspaceId } = useWorkspace();
  const { data: leads = [], isLoading } = useCrmLeads();
  const { data: stages = [] } = useCrmStages();
  const { createLead, moveLeadStage } = useCrmLeadMutations();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter((lead) =>
      `${lead.name || ''} ${lead.phone || ''} ${lead.email || ''} ${lead.company || ''} ${lead.interest || ''}`
        .toLowerCase()
        .includes(term),
    );
  }, [leads, search]);

  const byStage = useMemo(() => {
    const map = new Map<string, CrmLead[]>();
    for (const stage of stages) map.set(stage.id, []);
    for (const lead of filtered) {
      if (lead.stageId && map.has(lead.stageId)) map.get(lead.stageId)!.push(lead);
    }
    return map;
  }, [filtered, stages]);

  const handleCreate = async () => {
    await createLead.mutateAsync({
      name: form.name || null,
      phone: form.phone || null,
      email: form.email || null,
      company: form.company || null,
      interest: form.interest || null,
      estimated_value: form.estimatedValue ? Number(form.estimatedValue) : null,
      source: form.source || 'manual',
      campaign: form.campaign || null,
      notes: form.notes || null,
    });
    setForm(emptyForm);
    setDialogOpen(false);
  };

  if (!workspaceId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center">
            Crie ou selecione um workspace antes de usar o CRM.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <KanbanSquare className="h-6 w-6" />
            CRM
          </h1>
          <p className="text-sm text-muted-foreground">
            Todos os canais de aquisição entram neste funil{workspace ? ` — ${workspace.name}` : ''}.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo lead
        </Button>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome, telefone, empresa ou interesse"
        />
      </div>

      {isLoading ? (
        <Card><CardContent className="py-10 text-center">Carregando CRM...</CardContent></Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-4 2xl:grid-cols-6">
          {stages.map((stage) => (
            <Card
              key={stage.id}
              className={dragOverStage === stage.id ? 'ring-2 ring-primary' : ''}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverStage(stage.id);
              }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(event) => {
                event.preventDefault();
                const leadId = event.dataTransfer.getData('text/lead-id');
                setDragOverStage(null);
                if (leadId) moveLeadStage.mutate({ id: leadId, stageId: stage.id });
              }}
            >
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>{stage.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{byStage.get(stage.id)?.length || 0}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="min-h-32 space-y-2">
                {(byStage.get(stage.id) || []).map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData('text/lead-id', lead.id)}
                    className="cursor-grab rounded-lg border bg-background p-3 active:cursor-grabbing"
                  >
                    <div className="font-medium">{lead.name || lead.company || 'Lead sem nome'}</div>
                    {lead.company && lead.name && <div className="text-xs text-muted-foreground">{lead.company}</div>}
                    {lead.interest && <div className="mt-2 text-sm">{lead.interest}</div>}
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{lead.source || 'manual'}</span>
                      {lead.estimatedValue != null && (
                        <span>R$ {lead.estimatedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      )}
                    </div>
                    {lead.campaign && <div className="mt-1 text-xs text-muted-foreground">Campanha: {lead.campaign}</div>}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Novo lead</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Empresa</Label><Input value={form.company} onChange={(e) => setForm((v) => ({ ...v, company: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} /></div>
            <div className="space-y-2"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Interesse</Label><Input value={form.interest} onChange={(e) => setForm((v) => ({ ...v, interest: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Valor estimado</Label><Input type="number" min="0" step="0.01" value={form.estimatedValue} onChange={(e) => setForm((v) => ({ ...v, estimatedValue: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Origem</Label><Input value={form.source} onChange={(e) => setForm((v) => ({ ...v, source: e.target.value }))} placeholder="meta, smart_hub, google..." /></div>
            <div className="space-y-2"><Label>Campanha</Label><Input value={form.campaign} onChange={(e) => setForm((v) => ({ ...v, campaign: e.target.value }))} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createLead.isPending}>Salvar lead</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

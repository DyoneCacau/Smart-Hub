import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { CAPTURE_FORM_PRESETS, getCapturePresetForSegment } from '@/lib/captureFormPresets';
import type { BusinessSegment } from '@/lib/segmentPresets';
import { toast } from 'sonner';

interface CaptureFormRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  source: string;
  medium: string | null;
  campaign: string | null;
  is_published: boolean;
  created_at: string;
}

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

export default function CaptureForms() {
  const { user } = useAuth();
  const { workspace, workspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const defaultPreset = useMemo(() => getCapturePresetForSegment((workspace?.segment || 'services') as BusinessSegment), [workspace?.segment]);
  const [open, setOpen] = useState(false);
  const [presetId, setPresetId] = useState(defaultPreset.id);
  const [title, setTitle] = useState(defaultPreset.title);
  const [slug, setSlug] = useState('');
  const [source, setSource] = useState('instagram');
  const [medium, setMedium] = useState('bio');
  const [campaign, setCampaign] = useState('link-da-bio');
  const [saving, setSaving] = useState(false);

  const { data: forms = [], isLoading } = useQuery({
    queryKey: ['capture-forms', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('capture_forms')
        .select('id,slug,title,description,source,medium,campaign,is_published,created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as CaptureFormRow[];
    },
  });

  const choosePreset = (id: string) => {
    const preset = CAPTURE_FORM_PRESETS.find((item) => item.id === id) || defaultPreset;
    setPresetId(preset.id);
    setTitle(preset.title);
    setSlug(slugify(preset.id === 'software-development' ? 'criar-meu-projeto' : preset.title));
  };

  const create = async () => {
    if (!workspaceId || !user?.id) return;
    const preset = CAPTURE_FORM_PRESETS.find((item) => item.id === presetId) || defaultPreset;
    const finalSlug = slugify(slug || title) + '-' + Math.random().toString(36).slice(2, 6);
    setSaving(true);
    const { error } = await (supabase as any).from('capture_forms').insert({
      workspace_id: workspaceId,
      slug: finalSlug,
      title: title.trim() || preset.title,
      description: preset.description,
      segment: preset.segment,
      objective: preset.objective,
      submit_label: preset.submitLabel,
      fields: preset.fields,
      source: source.trim() || 'direct',
      medium: medium.trim() || null,
      campaign: campaign.trim() || null,
      is_published: true,
      created_by: user.id,
    });
    setSaving(false);
    if (error) {
      console.error(error);
      toast.error('Não foi possível criar o formulário');
      return;
    }
    toast.success('Formulário criado e publicado');
    setOpen(false);
    await queryClient.invalidateQueries({ queryKey: ['capture-forms', workspaceId] });
  };

  const togglePublished = async (form: CaptureFormRow) => {
    const { error } = await (supabase as any).from('capture_forms').update({ is_published: !form.is_published, updated_at: new Date().toISOString() }).eq('id', form.id);
    if (error) return toast.error('Não foi possível alterar a publicação');
    await queryClient.invalidateQueries({ queryKey: ['capture-forms', workspaceId] });
  };

  const publicUrl = (formSlug: string) => `${window.location.origin}/f/${formSlug}`;
  const copy = async (formSlug: string) => {
    await navigator.clipboard.writeText(publicUrl(formSlug));
    toast.success('Link copiado');
  };

  if (!workspaceId) return <div className="p-6 text-muted-foreground">Selecione um workspace.</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><FileText className="h-6 w-6" /> Formulários de captação</h1>
          <p className="text-muted-foreground">Crie briefings e formulários públicos que entram diretamente no CRM com origem, campanha e tracking.</p>
        </div>
        <Button onClick={() => { choosePreset(defaultPreset.id); setOpen(true); }}><Plus className="mr-2 h-4 w-4" /> Novo formulário</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Demonstração recomendada</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Para seu link da bio, use o preset <strong className="text-foreground">Desenvolvimento de software</strong> com origem <strong className="text-foreground">instagram</strong>, mídia <strong className="text-foreground">bio</strong> e campanha <strong className="text-foreground">link-da-bio</strong>. Cada envio vira um lead com o briefing completo no CRM.
        </CardContent>
      </Card>

      {isLoading ? <Card><CardContent className="py-10 text-center">Carregando...</CardContent></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {forms.length === 0 && <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhum formulário criado ainda.</CardContent></Card>}
          {forms.map((form) => (
            <Card key={form.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3 text-base">
                  <span>{form.title}</span>
                  <span className={`rounded-full px-2 py-1 text-xs ${form.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>{form.is_published ? 'Publicado' : 'Rascunho'}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <div><strong>Origem:</strong> {form.source}</div>
                  <div><strong>Mídia:</strong> {form.medium || '—'}</div>
                  <div><strong>Campanha:</strong> {form.campaign || '—'}</div>
                </div>
                <div className="break-all text-xs text-muted-foreground">{publicUrl(form.slug)}</div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => void copy(form.slug)}><Copy className="mr-2 h-4 w-4" /> Copiar link</Button>
                  <Button variant="outline" size="sm" onClick={() => window.open(publicUrl(form.slug), '_blank', 'noopener,noreferrer')}><ExternalLink className="mr-2 h-4 w-4" /> Abrir</Button>
                  <Button variant="ghost" size="sm" onClick={() => void togglePublished(form)}>{form.is_published ? 'Despublicar' : 'Publicar'}</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Novo formulário de captação</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Modelo</Label><Select value={presetId} onValueChange={choosePreset}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="software-development">Desenvolvimento de software — briefing completo</SelectItem>
              {CAPTURE_FORM_PRESETS.filter((item) => item.id !== 'software-development').map((item) => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}
            </SelectContent></Select></div>
            <div className="space-y-2"><Label>Título público</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-2"><Label>Slug do link</Label><Input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="criar-meu-projeto" /></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2"><Label>Origem</Label><Input value={source} onChange={(e) => setSource(e.target.value)} /></div>
              <div className="space-y-2"><Label>Mídia</Label><Input value={medium} onChange={(e) => setMedium(e.target.value)} /></div>
              <div className="space-y-2"><Label>Campanha</Label><Input value={campaign} onChange={(e) => setCampaign(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => void create()} disabled={saving}>{saving ? 'Criando...' : 'Criar e publicar'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
